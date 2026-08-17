import { describe, expect, it } from 'vitest';
import {
  cancelRoadProposalsFor,
  clearRoad,
  dropItems,
  movePlayer,
  resolveNightEconomy,
  scavenge,
} from '../src/game/actions';
import { RuleError } from '../src/game/errors';
import { appendBulletinPost } from '../src/game/facilities';
import { BRIDGE_SPAN } from '../src/game/map';
import { createInitialState } from '../src/game/setup';
import type { PlayerID, TruthState } from '../src/types';

const random = { Shuffle: <T,>(items: T[]) => [...items] };
const context = (G: TruthState, playerID: PlayerID) => ({ G, playerID }) as never;

describe('movement, economy and fog', () => {
  it('crosses the intact bridge span for no extra range/action and discovers an intermediate body', () => {
    const G = createInitialState(random);
    G.players['0'].location = 'VO';
    G.players['1'].location = 'BRIDGE_N';
    G.players['1'].alive = false;
    movePlayer(context(G, '0'), ['BRIDGE_N', 'BRIDGE_S']);
    expect(G.players['0'].location).toBe('BRIDGE_S');
    expect(G.players['0'].actionsLeft).toBe(1);
    expect(G.players['0'].knowledge.bodies['1']).toMatchObject({ value: 'BRIDGE_N', asOfDay: 0 });
  });

  it('records living-player knowledge at an intermediate node', () => {
    const G = createInitialState(random);
    G.players['0'].character = 'RESERVIST';
    G.players['0'].location = 'TEMPLE';
    G.players['1'].location = 'VO';

    movePlayer(context(G, '0'), ['VO', 'BRIDGE_N']);

    expect(G.players['0'].location).toBe('BRIDGE_N');
    expect(G.players['0'].knowledge.positions['1']).toEqual({
      value: 'VO', asOfDay: 0, source: 'co-location',
    });
  });

  it('keeps severed edges impassable', () => {
    const G = createInitialState(random);
    G.players['0'].location = 'BRIDGE_N';
    G.severedEdges = [BRIDGE_SPAN];
    expect(() => movePlayer(context(G, '0'), ['BRIDGE_S'])).toThrowError(new RuleError('IMPASSABLE'));
    expect(G.players['0'].actionsLeft).toBe(2);
  });

  it('locks even a zero-cost bridge crossing after Move Ready', () => {
    const G = createInitialState(random);
    G.players['0'].location = 'BRIDGE_N';
    G.players['0'].actionsLeft = 0;
    G.players['0'].ready = true;
    expect(() => movePlayer(context(G, '0'), ['BRIDGE_S'])).toThrowError('READY_LOCKED');
    expect(G.players['0'].location).toBe('BRIDGE_N');
  });

  it('copies a board history when a living player enters its node', () => {
    const G = createInitialState(random);
    G.players['0'].methods.push('BULLETIN');
    appendBulletinPost(G, '0', 'Office history');
    G.players['1'].location = 'TEMPLE';

    movePlayer(context(G, '1'), ['VO']);

    expect(G.players['1'].bulletinNotebook?.map(({ text }) => text)).toEqual(['Office history']);
  });

  it('clamps a mixed scavenge by resource and still charges one action on partial success', () => {
    const G = createInitialState(random);
    G.players['0'].location = 'CLINIC';
    G.players['0'].inventory = { food: 0, battery: 0 };
    G.caches.CLINIC = { food: 1, battery: 2 };
    scavenge(context(G, '0'), { food: 2, battery: 0 });
    expect(G.players['0'].inventory).toEqual({ food: 1, battery: 0 });
    expect(G.caches.CLINIC).toEqual({ food: 0, battery: 2 });
    expect(G.players['0'].actionsLeft).toBe(1);
  });

  it('rejects zero quantity and full hands without charging', () => {
    const G = createInitialState(random);
    expect(() => scavenge(context(G, '0'), { food: 0, battery: 0 })).toThrowError('ZERO_QUANTITY');
    expect(G.players['0'].actionsLeft).toBe(2);
    G.players['0'].inventory = { food: 5, battery: 5 };
    expect(() => scavenge(context(G, '0'), { food: 1, battery: 0 })).toThrowError('HANDS_FULL');
    expect(G.players['0'].actionsLeft).toBe(2);
  });

  it('lets the Store Owner drop positive items into the local cache', () => {
    const G = createInitialState(random);
    G.players['0'].character = 'STORE_OWNER';
    G.players['0'].inventory = { food: 6, battery: 4 };
    const before = { ...G.caches.VO };
    dropItems(context(G, '0'), { food: 2, battery: 1 });
    expect(G.players['0'].inventory).toEqual({ food: 4, battery: 3 });
    expect(G.caches.VO).toEqual({ food: before.food + 2, battery: before.battery + 1 });
    expect(G.players['0'].actionsLeft).toBe(1);
  });
});

describe('clear road and night economy', () => {
  it('repairs atomically after two co-located one-action contributions', () => {
    const G = createInitialState(random);
    G.severedEdges = [BRIDGE_SPAN];
    G.players['0'].location = 'BRIDGE_N';
    G.players['1'].location = 'BRIDGE_N';
    clearRoad(context(G, '0'), BRIDGE_SPAN);
    expect(G.severedEdges).toContain(BRIDGE_SPAN);
    expect(G.players['0'].actionsLeft).toBe(1);
    clearRoad(context(G, '1'), BRIDGE_SPAN);
    expect(G.severedEdges).not.toContain(BRIDGE_SPAN);
    expect(G.players['1'].actionsLeft).toBe(1);
  });

  it('refunds a pending contribution when its player cancels', () => {
    const G = createInitialState(random);
    G.severedEdges = [BRIDGE_SPAN];
    G.players['0'].location = 'BRIDGE_N';
    clearRoad(context(G, '0'), BRIDGE_SPAN);
    cancelRoadProposalsFor(G, '0');
    expect(G.players['0'].actionsLeft).toBe(2);
    expect(G.clearRoadProposals).toEqual({});
  });

  it('applies exposure and only the Nurse self-discount while grouped', () => {
    const G = createInitialState(random);
    G.day = 2;
    G.players['0'].character = 'NURSE';
    G.players['0'].location = 'SCHOOL';
    G.players['1'].location = 'SCHOOL';
    G.players['0'].inventory.food = 3;
    G.players['1'].inventory.food = 3;
    resolveNightEconomy(G);
    expect(G.players['0'].inventory.food).toBe(2);
    expect(G.players['1'].inventory.food).toBe(1);
  });
});
