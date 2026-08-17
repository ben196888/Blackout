import { Client } from 'boardgame.io/client';
import { Local } from 'boardgame.io/multiplayer';
import { describe, expect, it } from 'vitest';
import { METHOD_IDS } from '../src/constants';
import { BlackoutGame } from '../src/game/game';
import { RENDEZVOUS_CENTRE_NODES } from '../src/game/map';

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

  it('delivers the Day 4 change through radio and the VO board while preserving ignorance', () => {
    const multiplayer = Local();
    const clients = ['0', '1', '2', '3'].map((playerID) => Client({
      game: BlackoutGame,
      multiplayer,
      matchID: 'day-four-facilities-test',
      playerID,
      numPlayers: 4,
    }));
    clients.forEach((client) => client.start());
    for (const client of clients) {
      const projected = client.getState()?.G as unknown as { you: { character: string } };
      const count = projected.you.character === 'STUDENT' ? 5 : 4;
      client.moves.chooseMethods!(METHOD_IDS.slice(0, count));
      client.moves.ready!();
    }

    clients[0]!.moves.move!(['TEMPLE']);
    clients[0]!.moves.move!(['STORE']);
    clients[0]!.moves.done!(true);
    clients[1]!.moves.move!(['BRIDGE_S', 'BRIDGE_N']);
    clients[1]!.moves.move!(['VO']);
    clients[1]!.moves.done!(true);
    clients[2]!.moves.done!(true);
    clients[3]!.moves.done!(true);
    for (const client of clients) client.moves.ready!();

    for (const expectedDay of [2, 3]) {
      expect(clients[0]!.getState()?.G.day).toBe(expectedDay);
      for (const client of clients) client.moves.done!(true);
      for (const client of clients) client.moves.ready!();
    }

    expect(clients[0]!.getState()?.G.day).toBe(4);
    for (const client of clients) client.moves.done!(true);
    const batteryBefore = (clients[0]!.getState()?.G as unknown as {
      you: { inventory: { battery: number } };
    }).you.inventory.battery;
    clients[0]!.moves.setRadioListen!(true);
    for (const client of clients) client.moves.ready!();

    const radio = (clients[0]!.getState()?.G as unknown as {
      you: { rendezvousKnowledge?: { location: string; source: string }; inventory: { battery: number } };
    }).you;
    const office = (clients[1]!.getState()?.G as unknown as {
      you: { rendezvousKnowledge?: { location: string; source: string }; bulletinNotebook?: unknown[] };
    }).you;
    const unaware = (clients[2]!.getState()?.G as unknown as {
      you: { rendezvousKnowledge?: unknown; bulletinNotebook?: unknown[] };
    }).you;

    expect(RENDEZVOUS_CENTRE_NODES).toContain(radio.rendezvousKnowledge?.location);
    expect(radio.rendezvousKnowledge).toMatchObject({ source: 'RADIO' });
    expect(radio.inventory.battery).toBe(batteryBefore - 1);
    expect(office.rendezvousKnowledge).toEqual({
      location: radio.rendezvousKnowledge?.location,
      learnedDay: 4,
      source: 'BULLETIN',
    });
    expect(office.bulletinNotebook).toHaveLength(1);
    expect(unaware.rendezvousKnowledge).toBeUndefined();
    expect(unaware.bulletinNotebook).toBeUndefined();
    clients.forEach((client) => client.stop());
  });
});
