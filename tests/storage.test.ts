import type { LogEntry, Server as ServerTypes, State } from 'boardgame.io';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoggingInMemory } from '../src/server/storage';

afterEach(() => vi.restoreAllMocks());

describe('message logging storage', () => {
  it('rejects stale seat claims and case-insensitive duplicate names', () => {
    const storage = new LoggingInMemory();
    const metadata: ServerTypes.MatchData = {
      gameName: 'blackout',
      players: {
        0: { id: 0 },
        1: { id: 1 },
        2: { id: 2 },
        3: { id: 3 },
      },
      createdAt: 1,
      updatedAt: 1,
    };
    storage.setMetadata('match', metadata);

    const first = storage.fetch('match', { metadata: true }).metadata;
    const stale = storage.fetch('match', { metadata: true }).metadata;
    first.players[0]!.name = 'Player One';
    first.players[0]!.credentials = 'first-token';
    storage.setMetadata('match', first);

    stale.players[0]!.name = 'Other Player';
    stale.players[0]!.credentials = 'stale-token';
    expect(() => storage.setMetadata('match', stale)).toThrow('claimed at the same time');

    const duplicate = storage.fetch('match', { metadata: true }).metadata;
    duplicate.players[1]!.name = '  PLAYER ONE  ';
    duplicate.players[1]!.credentials = 'second-token';
    expect(() => storage.setMetadata('match', duplicate)).toThrow('already in this game');
    expect(storage.fetch('match', { metadata: true }).metadata.players[1]!.name).toBeUndefined();
  });

  it('emits one private structured event with match context and no credentials', () => {
    const write = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const storage = new LoggingInMemory();
    const state = { G: {}, ctx: {} } as State;
    const entry = {
      phase: 'contact',
      metadata: {
        paceMessage: {
          day: 2,
          sender: '0',
          method: 'SMS',
          target: '1',
          rawText: 'raw secret',
          deliveredText: 'raw secret',
          recipients: ['1'],
          dropped: [],
          excluded: [],
          truncated: false,
        },
      },
    } as unknown as LogEntry;
    storage.setState('match-123', state, [entry]);
    expect(write).toHaveBeenCalledOnce();
    const event = JSON.parse(String(write.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(event).toMatchObject({
      event: 'pace.message.v1', match: 'match-123', gameDay: 2,
      phase: 'contact', sender: '0', method: 'SMS', rawText: 'raw secret', recipients: ['1'],
    });
    expect(event.serverTime).toEqual(expect.any(String));
    expect(JSON.stringify(event)).not.toContain('credential');
  });

  it('emits every automatic night message attached to one transition', () => {
    const write = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const storage = new LoggingInMemory();
    const state = { G: {}, ctx: {} } as State;
    const base = {
      day: 4,
      sender: 'SYSTEM',
      target: null,
      dropped: [],
      excluded: [],
      truncated: false,
    };
    const entry = {
      phase: 'contact',
      metadata: {
        paceMessages: [
          { ...base, method: 'RADIO', rawText: 'radio', deliveredText: 'radio', recipients: ['0'] },
          { ...base, method: 'BULLETIN', rawText: 'board', deliveredText: 'board', recipients: ['1'] },
        ],
      },
    } as unknown as LogEntry;

    storage.setState('match-night', state, [entry]);

    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>))
      .toEqual([
        expect.objectContaining({ match: 'match-night', sender: 'SYSTEM', method: 'RADIO', rawText: 'radio' }),
        expect.objectContaining({ match: 'match-night', sender: 'SYSTEM', method: 'BULLETIN', rawText: 'board' }),
      ]);
  });

  it('emits private radio-choice analysis separately from actual messages', () => {
    const write = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const storage = new LoggingInMemory();
    const state = { G: {}, ctx: {} } as State;
    const entry = {
      phase: 'contact',
      metadata: {
        paceRadioChoices: [
          {
            day: 3, player: '0', outcome: 'LISTEN_SUCCESS',
            reason: 'NO_NEW_BROADCAST', batteryBefore: 2, batteryCharged: 1,
          },
          {
            day: 3, player: '1', outcome: 'LISTEN_FAILURE',
            reason: 'INSUFFICIENT_BATTERY', batteryBefore: 0, batteryCharged: 0,
          },
          {
            day: 3, player: '2', outcome: 'SKIP',
            reason: 'NOT_SELECTED', batteryBefore: 3, batteryCharged: 0,
          },
        ],
      },
    } as unknown as LogEntry;

    storage.setState('match-radio', state, [entry]);

    expect(write).toHaveBeenCalledTimes(3);
    const events = write.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
    expect(events).toEqual([
      expect.objectContaining({
        event: 'pace.radio-choice.v1', match: 'match-radio', gameDay: 3,
        player: '0', outcome: 'LISTEN_SUCCESS', reason: 'NO_NEW_BROADCAST',
        batteryBefore: 2, batteryCharged: 1,
      }),
      expect.objectContaining({ event: 'pace.radio-choice.v1', player: '1', outcome: 'LISTEN_FAILURE' }),
      expect.objectContaining({ event: 'pace.radio-choice.v1', player: '2', outcome: 'SKIP' }),
    ]);
    expect(JSON.stringify(events)).not.toContain('rawText');
  });
});
