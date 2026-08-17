import { describe, expect, it } from 'vitest';
import {
  BULLETIN_BOARD_IDS,
  RADIO_SILENT_NOTICE,
  appendBulletinPost,
  broadcastFromVillageOffice,
  ensureBulletinBoards,
  readCurrentBulletin,
  resolveNightRadio,
  setRadioListenIntent,
} from '../src/game/facilities';
import { edgeKey } from '../src/game/map';
import { createInitialState } from '../src/game/setup';
import type { PlayerID, TruthState } from '../src/types';

const random = { Shuffle: <T,>(items: T[]) => [...items] };
const state = () => createInitialState(random);

function leaderID(G: TruthState): PlayerID {
  return (Object.entries(G.players) as Array<[PlayerID, TruthState['players'][PlayerID]]>)
    .find(([, player]) => player.character === 'VILLAGE_LEADER')![0];
}

describe('night radio', () => {
  it('keeps listen intent private/editable and charges exactly one Battery on Day 5', () => {
    const G = state();
    G.day = 5;
    const before = G.players['0'].inventory.battery;
    setRadioListenIntent(G, '0', true);
    setRadioListenIntent(G, '0', false);
    setRadioListenIntent(G, '0', true);
    expect(G.players['0'].radioListen).toBe(true);

    resolveNightRadio(G);
    expect(G.players['0'].inventory.battery).toBe(before - 1);
    expect(G.players['0'].radioListen).toBe(false);
    expect(G.players['0'].rendezvousKnowledge).toBeUndefined();
  });

  it('notices a failed listen privately without a partial charge or rendezvous reveal', () => {
    const G = state();
    G.day = 4;
    G.rendezvous = 'STORE';
    G.players['0'].location = 'SCHOOL';
    G.players['0'].inventory.battery = 0;
    setRadioListenIntent(G, '0', true);

    resolveNightRadio(G);
    expect(G.players['0'].inventory.battery).toBe(0);
    expect(G.players['0'].rendezvousKnowledge).toBeUndefined();
    expect(G.players['0'].inbox.at(-1)).toMatchObject({
      from: 'SYSTEM', method: 'RADIO', text: RADIO_SILENT_NOTICE,
    });
    expect(G.messageOutcomes?.[0]).toMatchObject({
      sender: 'SYSTEM', method: 'RADIO', target: '0', recipients: ['0'],
      rawText: RADIO_SILENT_NOTICE,
    });
    expect(G.players['1'].inbox).toHaveLength(0);
  });

  it('reveals the Day 4 rendezvous to paid listeners and posts it once only at VO', () => {
    const G = state();
    G.day = 4;
    G.rendezvous = 'QUARRY';
    G.players['0'].location = 'SCHOOL';
    setRadioListenIntent(G, '0', true);

    const official = resolveNightRadio(G);
    resolveNightRadio(G);
    expect(G.players['0'].rendezvousKnowledge).toEqual({
      location: 'QUARRY', learnedDay: 4, source: 'RADIO',
    });
    expect(official).toMatchObject({ board: 'VO', day: 4, author: 'SYSTEM', official: true });
    expect(ensureBulletinBoards(G).VO).toHaveLength(1);
    expect(ensureBulletinBoards(G).SCHOOL).toHaveLength(0);
    expect(ensureBulletinBoards(G).COOP).toHaveLength(0);
    expect(ensureBulletinBoards(G).FOREST).toHaveLength(0);
    expect(G.messageOutcomes?.map(({ sender, method }) => ({ sender, method }))).toEqual([
      { sender: 'SYSTEM', method: 'RADIO' },
      { sender: 'SYSTEM', method: 'BULLETIN' },
    ]);
  });
});

describe('bulletin boards', () => {
  it('defines exactly the four resolved board locations', () => {
    expect(BULLETIN_BOARD_IDS).toEqual(['VO', 'SCHOOL', 'COOP', 'FOREST']);
    expect(Object.keys(ensureBulletinBoards(state()))).toEqual(BULLETIN_BOARD_IDS);
  });

  it('requires the writer to hold BULLETIN at their current board', () => {
    const G = state();
    expect(() => appendBulletinPost(G, '0', 'notice')).toThrow('METHOD_NOT_HELD');
    G.players['0'].methods.push('BULLETIN');
    G.players['0'].location = 'TEMPLE';
    expect(() => appendBulletinPost(G, '0', 'notice')).toThrow('NO_BULLETIN_BOARD');
  });

  it('locks bulletin posts after Contact Ready', () => {
    const G = state();
    G.players['0'].methods.push('BULLETIN');
    G.players['0'].ready = true;
    expect(() => appendBulletinPost(G, '0', 'too late')).toThrow('READY_LOCKED');
    expect(ensureBulletinBoards(G).VO).toHaveLength(0);
  });

  it('appends immutable-history posts and immediately records them for current occupants', () => {
    const G = state();
    G.day = 3;
    G.players['0'].methods.push('BULLETIN');
    G.players['0'].location = 'SCHOOL';
    G.players['1'].location = 'SCHOOL';
    appendBulletinPost(G, '0', 'first');
    appendBulletinPost(G, '0', 'second');

    expect(ensureBulletinBoards(G).SCHOOL.map(({ author, day, text }) => ({ author, day, text })))
      .toEqual([
        { author: '0', day: 3, text: 'first' },
        { author: '0', day: 3, text: 'second' },
      ]);
    expect(G.players['1'].bulletinNotebook?.map(({ text }) => text)).toEqual(['first', 'second']);
  });

  it('lets a later living visitor read without BULLETIN and retain a private notebook copy', () => {
    const G = state();
    G.day = 2;
    G.players['0'].methods.push('BULLETIN');
    appendBulletinPost(G, '0', 'office note');
    G.players['1'].location = 'VO';

    const read = readCurrentBulletin(G, '1');
    G.players['1'].location = 'SCHOOL';
    expect(read[0]).toMatchObject({ board: 'VO', day: 2, author: '0', text: 'office note' });
    expect(G.players['1'].bulletinNotebook?.[0]).toEqual(read[0]);
    expect(G.players['1'].methods).not.toContain('BULLETIN');
  });
});

describe('Village Leader broadcaster', () => {
  it('locks the office broadcaster after Contact Ready', () => {
    const G = state();
    const leader = leaderID(G);
    G.players[leader].location = 'VO';
    G.players[leader].ready = true;
    expect(() => broadcastFromVillageOffice(G, leader, 'too late')).toThrow('READY_LOCKED');
    expect(G.messageOutcomes).toBeUndefined();
  });
  it('requires the living Leader at VO and uses no selected method or Battery', () => {
    const G = state();
    const leader = leaderID(G);
    G.players[leader].location = 'VO';
    G.players[leader].methods = [];
    const before = G.players[leader].inventory.battery;

    broadcastFromVillageOffice(G, leader, 'Village update');
    expect(G.players[leader].inventory.battery).toBe(before);
    expect(G.players[leader].lastSend).toBeUndefined();

    G.players[leader].location = 'TEMPLE';
    expect(() => broadcastFromVillageOffice(G, leader, 'no')).toThrow('NOT_AT_VILLAGE_OFFICE');
    G.players[leader].location = 'VO';
    G.players[leader].alive = false;
    expect(() => broadcastFromVillageOffice(G, leader, 'no')).toThrow('PLAYER_DEAD');
  });

  it('caps at 60 characters and reaches only living graph-connected recipients', () => {
    const G = state();
    G.day = 4;
    const leader = leaderID(G);
    G.players[leader].location = 'VO';
    G.players['1'].location = 'SCHOOL';
    G.players['2'].location = 'TEMPLE';
    G.players['3'].alive = false;
    G.severedEdges = [edgeKey('VO', 'TEMPLE'), edgeKey('VO', 'BRIDGE_N')];

    const cut = broadcastFromVillageOffice(G, leader, 'x'.repeat(61));
    expect(cut).toMatchObject({ recipients: [], truncated: true, deliveredText: 'x'.repeat(60) });
    expect(cut.excluded).toContainEqual({ player: '1', reason: 'NOT_CONNECTED' });
    expect(cut.excluded).toContainEqual({ player: '2', reason: 'NOT_CONNECTED' });
    expect(cut.excluded).toContainEqual({ player: '3', reason: 'DEAD' });

    G.severedEdges = [edgeKey('VO', 'TEMPLE')];
    const restored = broadcastFromVillageOffice(G, leader, 'connection restored');
    expect(restored.recipients).toContain('1');
    expect(G.players['1'].inbox.at(-1)?.text).toBe('connection restored');
    expect(G.players[leader].lastSend).toBeUndefined();
  });
});
