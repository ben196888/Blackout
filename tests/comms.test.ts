import { describe, expect, it } from 'vitest';
import {
  METHOD_SPECS,
  deliver,
  exchangeItems,
} from '../src/game/comms';
import { playerView } from '../src/game/game';
import { createInitialState } from '../src/game/setup';
import type { MethodId, PlayerID, TruthState } from '../src/types';

const random = { Shuffle: <T,>(items: T[]) => [...items] };
const state = () => createInitialState(random);

function equip(G: TruthState, method: MethodId, ...players: PlayerID[]) {
  for (const player of players) G.players[player].methods.push(method);
}

describe('method specifications and schedule', () => {
  it('defines exactly seven selectable methods plus face-to-face in one table', () => {
    expect(Object.keys(METHOD_SPECS)).toEqual([
      'MOBILE_DATA', 'MOBILE_VOICE', 'SMS', 'LANDLINE',
      'MESH', 'WALKIE', 'BULLETIN', 'FACE_TO_FACE',
    ]);
    expect(METHOD_SPECS.SMS.payloadCap).toBe(20);
    expect(METHOD_SPECS.MESH).toMatchObject({ payloadCap: 40, batteryPerSends: 2, relayable: true });
    expect(METHOD_SPECS.WALKIE).toMatchObject({ payloadCap: 40, batteryPerSends: 3, audience: 'IN_RANGE' });
    expect(METHOD_SPECS.BULLETIN.audience).toBe('ASYNC_AT_NODE');
    expect(METHOD_SPECS.FACE_TO_FACE.payloadCap).toBeNull();
  });

  it('encodes voice and SMS degradation, infrastructure death, and Day 6 data', () => {
    expect(METHOD_SPECS.MOBILE_VOICE.availability[1]).toMatchObject({ up: true, dropRate: 0.5 });
    expect(METHOD_SPECS.MOBILE_VOICE.availability[2]?.up).toBe(false);
    expect(METHOD_SPECS.SMS.availability[1]).toMatchObject({ up: true, dropRate: 0 });
    expect(METHOD_SPECS.SMS.availability[2]).toMatchObject({ up: true, dropRate: 0.25 });
    expect(METHOD_SPECS.LANDLINE.availability[2]?.up).toBe(true);
    expect(METHOD_SPECS.LANDLINE.availability[3]?.up).toBe(false);
    expect(METHOD_SPECS.MOBILE_DATA.availability[6]).toMatchObject({ up: true, coverage: 'DAY_6_ZONES' });
    expect(METHOD_SPECS.MOBILE_DATA.availability[7]?.up).toBe(false);
    expect(Object.values(METHOD_SPECS.MESH.availability).every(({ up }) => up)).toBe(true);
  });
});

describe('remote delivery privacy, costs, caps, and drops', () => {
  it('requires both parties to hold a method and reports only sent to the sender', () => {
    const G = state();
    G.day = 1;
    equip(G, 'SMS', '0');
    const result = deliver(G, '0', { method: 'SMS', target: '1', text: 'WHERE ARE YOU' }, () => 0.9);
    expect(result).toEqual({ state: 'sent' });
    expect(G.players['0'].lastSend).toEqual({ day: 1, state: 'sent' });
    expect(G.players['1'].inbox).toHaveLength(0);
    expect(G.messageOutcomes?.at(-1)).toMatchObject({
      recipients: [],
      excluded: [{ player: '1', reason: 'METHOD_NOT_HELD' }],
    });

    const senderView = JSON.stringify(playerView({ G, playerID: '0' }));
    expect(senderView).not.toContain('WHERE ARE YOU');
    expect(senderView).not.toContain('METHOD_NOT_HELD');
  });

  it('charges infrastructure once per method per day and truncates SMS by characters', () => {
    const G = state();
    G.day = 1;
    equip(G, 'SMS', '0', '1');
    const before = G.players['0'].inventory.battery;
    deliver(G, '0', { method: 'SMS', target: '1', text: '12345678901234567890EXTRA' }, () => 0.9);
    deliver(G, '0', { method: 'SMS', target: '1', text: 'SECOND' }, () => 0.9);
    expect(G.players['0'].inventory.battery).toBe(before - 1);
    expect(G.players['1'].inbox[0]?.text).toBe('12345678901234567890');
    expect(G.messageOutcomes?.[0]).toMatchObject({ truncated: true, deliveredText: '12345678901234567890' });
    expect(G.players['1'].inbox[1]?.text).toBe('SECOND');
  });

  it('uses the seeded roll for voice and Day 2 SMS drops', () => {
    const voice = state();
    voice.day = 1;
    equip(voice, 'MOBILE_VOICE', '0', '1');
    deliver(voice, '0', { method: 'MOBILE_VOICE', target: '1', text: 'hello' }, () => 0.49);
    expect(voice.players['1'].inbox).toHaveLength(0);
    expect(voice.messageOutcomes?.[0]?.dropped).toEqual(['1']);

    const sms = state();
    sms.day = 2;
    equip(sms, 'SMS', '0', '1');
    deliver(sms, '0', { method: 'SMS', target: '1', text: 'hello' }, () => 0.25);
    expect(sms.players['1'].inbox).toHaveLength(1);
    expect(sms.messageOutcomes?.[0]?.dropped).toEqual([]);
  });

  it('limits Day 6 data to both radius-2 coverage zones', () => {
    const G = state();
    G.day = 6;
    G.rendezvous = 'STORE';
    equip(G, 'MOBILE_DATA', '0', '1', '2');
    G.players['0'].location = 'SCHOOL';
    G.players['1'].location = 'FIELD';
    G.players['2'].location = 'FOREST';
    deliver(G, '0', { method: 'MOBILE_DATA', target: '1', text: 'school zone' }, () => 0.9);
    deliver(G, '0', { method: 'MOBILE_DATA', target: '2', text: 'too far' }, () => 0.9);
    expect(G.players['1'].inbox.at(-1)?.text).toBe('school zone');
    expect(G.players['2'].inbox).toHaveLength(0);
    expect(G.messageOutcomes?.at(-1)?.excluded).toEqual([{ player: '2', reason: 'NOT_CONNECTED' }]);

    G.players['0'].location = 'SHRINE';
    G.players['2'].location = 'QUARRY';
    deliver(G, '0', { method: 'MOBILE_DATA', target: '2', text: 'rendezvous zone' }, () => 0.9);
    expect(G.players['2'].inbox.at(-1)?.text).toBe('rendezvous zone');
  });

  it('rejects an unavailable sender channel without charging', () => {
    const G = state();
    G.day = 3;
    equip(G, 'SMS', '0', '1');
    const before = G.players['0'].inventory.battery;
    expect(() => deliver(G, '0', { method: 'SMS', target: '1', text: 'hello' }, () => 0.9))
      .toThrow('METHOD_UNAVAILABLE');
    expect(G.players['0'].inventory.battery).toBe(before);
    expect(G.messageOutcomes).toBeUndefined();
  });
});

describe('local and durable methods', () => {
  it('burns the single daily landline dial when the valid endpoint is empty', () => {
    const G = state();
    G.day = 1;
    equip(G, 'LANDLINE', '0', '1');
    G.players['0'].location = 'VO';
    G.players['1'].location = 'SCHOOL';
    deliver(G, '0', { method: 'LANDLINE', target: 'CLINIC', text: 'anyone?' }, () => 0.9);
    expect(G.messageOutcomes?.[0]?.recipients).toEqual([]);
    expect(G.players['0'].commsUsage?.landlineDialed).toBe(true);
    expect(() => deliver(G, '0', { method: 'LANDLINE', target: 'SCHOOL', text: 'retry' }, () => 0.9))
      .toThrow('LANDLINE_DIAL_USED');
    expect(G.players['1'].inbox).toHaveLength(0);
  });

  it('relays mesh over radius 2 only through a living occupied intermediate node', () => {
    const G = state();
    G.day = 3;
    equip(G, 'MESH', '0', '1');
    G.players['0'].location = 'VO';
    G.players['1'].location = 'SCHOOL';
    G.players['2'].location = 'BRIDGE_N';
    deliver(G, '0', { method: 'MESH', target: '1', text: 'relayed' }, () => 0.9);
    expect(G.players['1'].inbox.at(-1)?.text).toBe('relayed');

    G.players['2'].alive = false;
    deliver(G, '0', { method: 'MESH', target: '1', text: 'silence' }, () => 0.9);
    expect(G.players['1'].inbox).toHaveLength(1);
    expect(G.messageOutcomes?.at(-1)?.excluded).toEqual([{ player: '1', reason: 'NOT_CONNECTED' }]);
  });

  it('lets the Student reach radius 2 on mesh without a relay', () => {
    const G = state();
    G.day = 3;
    equip(G, 'MESH', '0', '1');
    G.players['0'].character = 'STUDENT';
    G.players['0'].location = 'VO';
    G.players['1'].location = 'SCHOOL';
    G.players['2'].location = 'FOREST';
    deliver(G, '0', { method: 'MESH', target: '1', text: 'student' }, () => 0.9);
    expect(G.players['1'].inbox.at(-1)?.text).toBe('student');
  });

  it('charges mesh by send quota and doubles each charge on Day 5', () => {
    const G = state();
    G.day = 5;
    equip(G, 'MESH', '0', '1');
    G.players['0'].location = 'VO';
    G.players['1'].location = 'TEMPLE';
    G.players['0'].inventory.battery = 5;
    for (const text of ['one', 'two', 'three']) {
      deliver(G, '0', { method: 'MESH', target: '1', text }, () => 0.9);
    }
    expect(G.players['0'].inventory.battery).toBe(1);
    expect(G.players['1'].inbox.map(({ text }) => text)).toEqual(['one', 'two', 'three']);
  });

  it('broadcasts walkie to all holders in range and gives the Reservist radius 2', () => {
    const G = state();
    G.day = 4;
    equip(G, 'WALKIE', '0', '1', '2');
    G.players['0'].character = 'RESERVIST';
    G.players['0'].location = 'VO';
    G.players['1'].location = 'SCHOOL';
    G.players['2'].location = 'TEMPLE';
    G.players['3'].location = 'BRIDGE_N';
    deliver(G, '0', { method: 'WALKIE', target: null, text: 'all stations' }, () => 0.9);
    expect(G.players['1'].inbox.at(-1)?.text).toBe('all stations');
    expect(G.players['2'].inbox.at(-1)?.text).toBe('all stations');
    expect(G.players['3'].inbox).toHaveLength(0);
    expect(G.messageOutcomes?.[0]?.excluded).toContainEqual({ player: '3', reason: 'METHOD_NOT_HELD' });
  });

  it('excludes dead senders, recipients, and relays', () => {
    const G = state();
    G.day = 4;
    equip(G, 'WALKIE', '0', '1');
    G.players['0'].location = 'VO';
    G.players['1'].location = 'TEMPLE';
    G.players['1'].alive = false;
    deliver(G, '0', { method: 'WALKIE', target: null, text: 'check' }, () => 0.9);
    expect(G.players['1'].inbox).toHaveLength(0);
    expect(G.messageOutcomes?.[0]?.excluded).toEqual([{ player: '1', reason: 'DEAD' }]);
    G.players['0'].alive = false;
    expect(() => deliver(G, '0', { method: 'WALKIE', target: null, text: 'check' }, () => 0.9))
      .toThrow('PLAYER_DEAD');
  });

  it('confirms free unlimited face-to-face only to living co-located players', () => {
    const G = state();
    G.day = 4;
    G.players['0'].location = 'SCHOOL';
    G.players['1'].location = 'SCHOOL';
    G.players['2'].location = 'SCHOOL';
    G.players['2'].alive = false;
    const before = G.players['0'].inventory.battery;
    const result = deliver(G, '0', { method: 'FACE_TO_FACE', target: null, text: 'x'.repeat(100) }, () => 0);
    expect(result).toEqual({ state: 'delivered', recipients: ['1'] });
    expect(G.players['1'].inbox[0]?.text).toHaveLength(100);
    expect(G.players['0'].inventory.battery).toBe(before);
  });

  it('exposes bulletin configuration but defers persistence to M4', () => {
    const G = state();
    G.day = 3;
    equip(G, 'BULLETIN', '0');
    expect(METHOD_SPECS.BULLETIN.availability[7]?.up).toBe(true);
    expect(() => deliver(G, '0', { method: 'BULLETIN', target: 'VO', text: 'notice' }, () => 0.9))
      .toThrow('BULLETIN_DEFERRED');
  });
});

describe('exchange', () => {
  it('moves positive quantities atomically without spending a Contact action', () => {
    const G = state();
    G.players['0'].location = 'SCHOOL';
    G.players['1'].location = 'SCHOOL';
    const actions = G.players['0'].actionsLeft;
    exchangeItems(G, '0', '1', { food: 1, battery: 2 });
    expect(G.players['0'].inventory).toEqual({ food: 2, battery: 1 });
    expect(G.players['1'].inventory).toEqual({ food: 4, battery: 5 });
    expect(G.players['0'].actionsLeft).toBe(actions);
  });

  it('validates ownership and receiver capacity before mutating either inventory', () => {
    const G = state();
    G.players['0'].location = 'SCHOOL';
    G.players['1'].location = 'SCHOOL';
    const senderBefore = { ...G.players['0'].inventory };
    const recipientBefore = { ...G.players['1'].inventory };
    expect(() => exchangeItems(G, '0', '1', { food: 4, battery: 0 })).toThrow('INSUFFICIENT_ITEMS');
    expect(G.players['0'].inventory).toEqual(senderBefore);
    expect(G.players['1'].inventory).toEqual(recipientBefore);

    G.players['1'].inventory = { food: 5, battery: 5 };
    expect(() => exchangeItems(G, '0', '1', { food: 1, battery: 0 })).toThrow('HANDS_FULL');
    expect(G.players['0'].inventory).toEqual(senderBefore);
    expect(G.players['1'].inventory).toEqual({ food: 5, battery: 5 });
  });

  it('rejects zero, remote, and dead-player exchanges', () => {
    const G = state();
    expect(() => exchangeItems(G, '0', '1', { food: 0, battery: 0 })).toThrow('NOT_COLOCATED');
    G.players['1'].location = G.players['0'].location;
    expect(() => exchangeItems(G, '0', '1', { food: 0, battery: 0 })).toThrow('ZERO_QUANTITY');
    G.players['1'].alive = false;
    expect(() => exchangeItems(G, '0', '1', { food: 1, battery: 0 })).toThrow('PLAYER_DEAD');
  });
});
