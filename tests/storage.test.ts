import type { LogEntry, State } from 'boardgame.io';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoggingInMemory } from '../src/server/storage';

afterEach(() => vi.restoreAllMocks());

describe('message logging storage', () => {
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
});
