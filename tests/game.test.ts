import { Client } from 'boardgame.io/client';
import { Local } from 'boardgame.io/multiplayer';
import { describe, expect, it } from 'vitest';
import { METHOD_IDS } from '../src/constants';
import { BlackoutGame } from '../src/game/game';

describe('planning phase', () => {
  it('locks valid method sets and advances four simultaneous players to Day 1 Move', async () => {
    const multiplayer = Local();
    const clients = ['0', '1', '2', '3'].map((playerID) => Client({
      game: BlackoutGame,
      multiplayer,
      matchID: 'planning-test',
      playerID,
      numPlayers: 4,
    }));
    clients.forEach((client) => client.start());
    await new Promise((resolve) => setTimeout(resolve, 0));

    for (const client of clients) {
      const state = client.getState();
      const projected = state?.G as unknown as { you: { character: string } };
      const count = projected.you.character === 'STUDENT' ? 5 : 4;
      client.moves.chooseMethods!(METHOD_IDS.slice(0, count));
      await new Promise((resolve) => setTimeout(resolve, 0));
      client.moves.ready!();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    await expect.poll(() => clients[0]?.getState()?.ctx.phase).toBe('move');
    for (const client of clients) {
      const state = client.getState();
      expect(state?.ctx.phase).toBe('move');
      expect(state?.G.day).toBe(1);
      const projected = state?.G as unknown as { commsPlan: { locked: boolean } };
      expect(projected.commsPlan.locked).toBe(true);
    }
    clients.forEach((client) => client.stop());
  });

  it('delivers a Contact message privately through the real reducer', async () => {
    const multiplayer = Local();
    const clients = ['0', '1', '2', '3'].map((playerID) => Client({
      game: BlackoutGame,
      multiplayer,
      matchID: 'contact-test',
      playerID,
      numPlayers: 4,
    }));
    clients.forEach((client) => client.start());
    for (const client of clients) {
      const state = client.getState();
      const projected = state?.G as unknown as { you: { character: string } };
      const count = projected.you.character === 'STUDENT' ? 5 : 4;
      client.moves.chooseMethods!(METHOD_IDS.slice(0, count));
      client.moves.ready!();
    }
    expect(clients[0]?.getState()?.ctx.phase).toBe('move');
    for (const client of clients) client.moves.done!(true);
    expect(clients[0]?.getState()?.ctx.phase).toBe('contact');
    clients[0]?.moves.sendMessage!({ method: 'SMS', target: '1', text: 'MEET AT SCHOOL' });

    const sender = clients[0]?.getState()?.G as unknown as { you: { lastSend?: unknown }; messageOutcomes?: unknown };
    const recipient = clients[1]?.getState()?.G as unknown as { you: { inbox: Array<{ text: string }> } };
    expect(sender.you.lastSend).toEqual({ day: 1, state: 'sent' });
    expect(sender.messageOutcomes).toBeUndefined();
    expect(recipient.you.inbox.at(-1)?.text).toBe('MEET AT SCHOOL');
    clients.forEach((client) => client.stop());
  });
});
