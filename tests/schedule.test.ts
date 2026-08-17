import { describe, expect, it } from 'vitest';
import { DEFAULT_RENDEZVOUS } from '../src/constants';
import { ensureBulletinBoards } from '../src/game/facilities';
import { BRIDGE_SPAN, DAY_2_EDGE, RENDEZVOUS_CENTRE_NODES, connectedComponents } from '../src/game/map';
import {
  SEVEN_DAY_SCHEDULE,
  applyScheduledDay,
  calculateStars,
  changeRendezvousForDayFour,
  resolveImmediateLoss,
  resolveScheduledNight,
  scoreAfterNightSeven,
} from '../src/game/schedule';
import { createInitialState } from '../src/game/setup';
import type { PlayerID, TruthState } from '../src/types';

const setupRandom = { Shuffle: <T,>(items: T[]) => [...items] };
const state = () => createInitialState(setupRandom);
const fixed = (node: string) => ({
  Shuffle: <T,>(items: T[]) => {
    const selected = items.find((item) => item === node);
    return selected === undefined ? [...items] : [selected, ...items.filter((item) => item !== selected)];
  },
});
const ids: PlayerID[] = ['0', '1', '2', '3'];

describe('pinned seven-day schedule', () => {
  it('records all seven event, exposure, infrastructure and Battery rules', () => {
    expect(SEVEN_DAY_SCHEDULE.map((entry) => ({
      day: entry.day,
      edge: entry.severedEdge,
      exposure: entry.exposureNight,
      data: entry.communication.mobileData,
      voice: entry.communication.mobileVoiceDropRate,
      sms: entry.communication.smsDropRate,
      landline: entry.communication.landlineUp,
      multiplier: entry.communication.batteryCostMultiplier,
      radio: entry.communication.radioBatteryCost,
    }))).toEqual([
      { day: 1, edge: null, exposure: false, data: 'DOWN', voice: 0.5, sms: 0, landline: true, multiplier: 1, radio: 1 },
      { day: 2, edge: DAY_2_EDGE, exposure: true, data: 'DOWN', voice: null, sms: 0.25, landline: true, multiplier: 1, radio: 1 },
      { day: 3, edge: BRIDGE_SPAN, exposure: true, data: 'DOWN', voice: null, sms: null, landline: false, multiplier: 1, radio: 1 },
      { day: 4, edge: null, exposure: false, data: 'DOWN', voice: null, sms: null, landline: false, multiplier: 1, radio: 1 },
      { day: 5, edge: null, exposure: true, data: 'DOWN', voice: null, sms: null, landline: false, multiplier: 2, radio: 1 },
      { day: 6, edge: null, exposure: false, data: 'RADIUS_2_ZONES', voice: null, sms: null, landline: false, multiplier: 1, radio: 1 },
      { day: 7, edge: null, exposure: false, data: 'DOWN', voice: null, sms: null, landline: false, multiplier: 1, radio: 1 },
    ]);
  });

  it('catches up the Day 2 and Day 3 cuts to exactly two components of eight', () => {
    const G = state();
    G.day = 3;
    applyScheduledDay(G);
    expect(G.severedEdges).toEqual([DAY_2_EDGE, BRIDGE_SPAN]);
    expect(connectedComponents(G.severedEdges).map((component) => component.length)).toEqual([8, 8]);
  });

  it('does not re-sever a road cleared after its one-shot event', () => {
    const G = state();
    G.day = 2;
    applyScheduledDay(G);
    G.severedEdges = G.severedEdges.filter((edge) => edge !== DAY_2_EDGE);
    applyScheduledDay(G);
    expect(G.severedEdges).not.toContain(DAY_2_EDGE);
  });
});

describe('Day 4 rendezvous and night ordering', () => {
  it('draws from the centre excluding current and never mutates twice', () => {
    const G = state();
    G.day = 4;
    let calls = 0;
    const random = {
      Shuffle: <T,>(items: T[]) => {
        calls += 1;
        expect(items).not.toContain(DEFAULT_RENDEZVOUS);
        return fixed('SHRINE').Shuffle(items);
      },
    };
    expect(changeRendezvousForDayFour(G, random)).toBe('SHRINE');
    expect(changeRendezvousForDayFour(G, random)).toBe('SHRINE');
    expect(calls).toBe(1);
    expect(RENDEZVOUS_CENTRE_NODES).toContain(G.rendezvous);
  });

  it('accepts an already-mutated M4 rendezvous without another random draw', () => {
    const G = state();
    G.day = 4;
    G.rendezvous = 'TEA';
    let called = false;
    const result = changeRendezvousForDayFour(G, {
      Shuffle: <T,>(items: T[]) => {
        called = true;
        return items;
      },
    });
    expect(result).toBe('TEA');
    expect(called).toBe(false);
  });

  it('resolves economy, then changes rendezvous before radio and the official VO post', () => {
    const G = state();
    G.day = 4;
    G.players['0'].location = 'SCHOOL';
    G.players['0'].radioListen = true;
    G.players['0'].inventory = { food: 5, battery: 2 };

    resolveScheduledNight(G, fixed('SHRINE'));
    expect(G.rendezvous).toBe('SHRINE');
    expect(G.players['0'].rendezvousKnowledge).toEqual({
      location: 'SHRINE', learnedDay: 4, source: 'RADIO',
    });
    expect(ensureBulletinBoards(G).VO[0]?.text).toBe('Official rendezvous: SHRINE');
    expect(G.players['0'].inventory.battery).toBe(1);
  });

  it('removes a newly starved player before their requested radio listen', () => {
    const G = state();
    G.day = 4;
    G.players['0'].radioListen = true;
    G.players['0'].inventory = { food: 0, battery: 2 };
    G.players['0'].starvationNights = 1;

    resolveScheduledNight(G, fixed('SHRINE'));
    expect(G.players['0'].alive).toBe(false);
    expect(G.players['0'].inventory.battery).toBe(2);
    expect(G.players['0'].rendezvousKnowledge).toBeUndefined();
    expect(G.rendezvous).toBe('SHRINE');
    expect(ensureBulletinBoards(G).VO).toHaveLength(1);
  });

  it('refreshes stationary co-location knowledge after nightly deaths and notices', () => {
    const G = state();
    G.day = 3;
    G.players['0'].location = 'STORE';
    G.players['1'].location = 'STORE';
    resolveScheduledNight(G, fixed('TEA'));
    expect(G.players['0'].knowledge.positions['1']).toMatchObject({
      value: 'STORE', asOfDay: 3, source: 'co-location',
    });
  });
});

describe('terminal outcomes', () => {
  it('ends immediately in a fully revealed loss when the last survivors die', () => {
    const G = state();
    G.day = 6;
    for (const id of ids) {
      G.players[id].inventory.food = 0;
      G.players[id].starvationNights = 1;
    }
    G.players['0'].knowledge.bodies['3'] = { value: 'FOREST', asOfDay: 5, source: 'body' };

    const outcome = resolveScheduledNight(G, fixed('VO'));
    expect(outcome).toMatchObject({
      result: 'LOSS', reason: 'ALL_DEAD', endedAfterNight: 6,
      trueRendezvous: 'SCHOOL',
      calculation: { survivorCount: 0, stars: 0 },
    });
    expect(outcome?.players['0']).toMatchObject({
      alive: false,
      finalLocation: 'VO',
      bodyLocation: 'VO',
      inventory: { food: 0, battery: 3 },
      discoveries: { knowledge: { bodies: { '3': { value: 'FOREST' } } } },
    });
  });

  it('does not reveal a private death while another player is still alive', () => {
    const G = state();
    G.day = 5;
    G.players['0'].alive = false;
    expect(resolveImmediateLoss(G)).toBeUndefined();
    expect(G.terminalOutcome).toBeUndefined();
  });

  it('does not score before night 7', () => {
    const G = state();
    G.day = 6;
    expect(scoreAfterNightSeven(G)).toBeUndefined();
    expect(G.terminalOutcome).toBeUndefined();
  });

  it('awards one star when one to three players survive', () => {
    const G = state();
    G.day = 7;
    G.rendezvous = 'TEA';
    for (const id of ['1', '2', '3'] as PlayerID[]) G.players[id].alive = false;
    G.players['0'].location = 'TEA';
    expect(calculateStars(G)).toEqual({
      survivorCount: 1,
      allPlayersSurvived: false,
      allSurvivorsAtTrueRendezvous: true,
      stars: 1,
    });
    expect(scoreAfterNightSeven(G)?.calculation.stars).toBe(1);
  });

  it('awards two stars when all survive without gathering at the true rendezvous', () => {
    const G = state();
    G.day = 7;
    G.rendezvous = 'TEA';
    for (const id of ids) G.players[id].location = 'SCHOOL';
    expect(scoreAfterNightSeven(G)).toMatchObject({
      result: 'WIN', reason: 'NIGHT_7_COMPLETE',
      calculation: { survivorCount: 4, allPlayersSurvived: true, stars: 2 },
    });
  });

  it('awards three stars only when all four survive at the true rendezvous', () => {
    const G: TruthState = state();
    G.day = 7;
    G.rendezvous = 'TEA';
    for (const id of ids) G.players[id].location = 'TEA';
    expect(scoreAfterNightSeven(G)).toMatchObject({
      result: 'WIN',
      calculation: {
        survivorCount: 4,
        allPlayersSurvived: true,
        allSurvivorsAtTrueRendezvous: true,
        stars: 3,
      },
    });
  });
});

describe('full seven-night outcome trajectories', () => {
  function play(G: TruthState) {
    for (let day = 1; day <= 7 && !G.terminalOutcome; day += 1) {
      G.day = day;
      applyScheduledDay(G);
      resolveScheduledNight(G, fixed('TEA'));
    }
    return G.terminalOutcome;
  }

  it('ends a total-loss game immediately when Night 1 kills everyone', () => {
    const G = state();
    for (const id of ids) {
      G.players[id].inventory = { food: 0, battery: 0 };
      G.players[id].starvationNights = 1;
    }
    expect(play(G)).toMatchObject({
      result: 'LOSS', reason: 'ALL_DEAD', endedAfterNight: 1,
      calculation: { survivorCount: 0, stars: 0 },
    });
  });

  it('plays through Night 7 for a one-star partial survival', () => {
    const G = state();
    G.players['0'].location = 'STORE';
    G.players['0'].inventory = { food: 7, battery: 0 };
    for (const id of ['1', '2', '3'] as PlayerID[]) {
      G.players[id].inventory = { food: 0, battery: 0 };
      G.players[id].starvationNights = 1;
    }
    expect(play(G)).toMatchObject({
      reason: 'NIGHT_7_COMPLETE', endedAfterNight: 7,
      calculation: { survivorCount: 1, stars: 1 },
    });
  });

  it('plays through Night 7 for two stars when all survive apart', () => {
    const G = state();
    for (const id of ids) {
      G.players[id].location = 'STORE';
      G.players[id].inventory = { food: 7, battery: 0 };
    }
    expect(play(G)).toMatchObject({
      reason: 'NIGHT_7_COMPLETE', trueRendezvous: 'TEA',
      calculation: { survivorCount: 4, stars: 2 },
    });
  });

  it('plays through all exposure nights for three stars at the true rendezvous', () => {
    const G = state();
    for (const id of ids) {
      G.players[id].location = 'TEA';
      G.players[id].inventory = { food: 10, battery: 0 };
    }
    expect(play(G)).toMatchObject({
      reason: 'NIGHT_7_COMPLETE', trueRendezvous: 'TEA',
      calculation: {
        survivorCount: 4,
        allPlayersSurvived: true,
        allSurvivorsAtTrueRendezvous: true,
        stars: 3,
      },
    });
  });
});
