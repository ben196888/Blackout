import type { Game } from 'boardgame.io';
import { Client } from 'boardgame.io/client';
import { Local } from 'boardgame.io/multiplayer';
import { describe, expect, it } from 'vitest';
import { BALANCE, METHOD_IDS } from '../src/constants';
import { BlackoutGame } from '../src/game/game';
import { BRIDGE_SPAN, DAY_2_EDGE, RENDEZVOUS_CENTRE_NODES } from '../src/game/map';
import { createInitialState } from '../src/game/setup';
import type { PlayerID, TruthState } from '../src/types';

describe('planning phase', () => {
  it('broadcasts and logs unrestricted public Day 0 discussion', async () => {
    const multiplayer = Local();
    const clients = ['0', '1', '2', '3'].map((playerID) => Client({
      game: BlackoutGame,
      multiplayer,
      matchID: 'planning-discussion-test',
      playerID,
      numPlayers: 4,
    }));
    clients.forEach((client) => client.start());

    clients[0]!.moves.sendPlanningMessage!('  Cover mesh?  ');
    for (const client of clients) {
      const view = client.getState()?.G as unknown as {
        planningMessages: Array<{ author: string; text: string }>;
      };
      expect(view.planningMessages).toEqual([{ id: 1, author: '0', text: 'Cover mesh?' }]);
    }
    const log = clients[0]!.getState()?.log.at(-1)?.metadata as {
      paceMessage?: { method: string; recipients: string[]; rawText: string };
    };
    expect(log.paceMessage).toEqual(expect.objectContaining({
      method: 'PLANNING', recipients: ['1', '2', '3'], rawText: 'Cover mesh?',
    }));
    const owner = clients[0]!.getState()?.G as unknown as { you: { character: string } };
    clients[0]!.moves.chooseMethods!(METHOD_IDS.slice(0, owner.you.character === 'STUDENT' ? 5 : 4));
    clients[0]!.moves.ready!();
    clients[0]!.moves.sendPlanningMessage!('Too late');
    const locked = clients[0]!.getState()?.G as unknown as { planningMessages: unknown[] };
    expect(locked.planningMessages).toHaveLength(1);
    clients.forEach((client) => client.stop());
  });

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
    expect(sender.you.lastSend).toMatchObject({ day: 1, state: 'sent' });
    expect(sender.messageOutcomes).toBeUndefined();
    expect(recipient.you.inbox.at(-1)?.text).toBe('MEET AT SCHOOL');
    clients[0]?.moves.ready!();
    clients[0]?.moves.sendMessage!({ method: 'SMS', target: '1', text: 'TOO LATE' });
    const lockedRecipient = clients[1]?.getState()?.G as unknown as { you: { inbox: Array<{ text: string }> } };
    expect(lockedRecipient.you.inbox.map(({ text }) => text)).toEqual(['MEET AT SCHOOL']);
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
    clients[1]!.moves.scavenge!({ food: 2, battery: 0 });
    clients[1]!.moves.scavenge!({ food: 2, battery: 0 });
    clients[1]!.moves.done!(true);
    clients[2]!.moves.done!(true);
    clients[3]!.moves.done!(true);
    for (const client of clients) client.moves.ready!();

    for (const expectedDay of [2, 3]) {
      expect(clients[0]!.getState()?.G.day).toBe(expectedDay);
      if (expectedDay === 2) clients[0]!.moves.scavenge!({ food: 2, battery: 0 });
      if (expectedDay === 2) {
        clients[1]!.moves.move!(['BRIDGE_S', 'BRIDGE_N']);
        clients[1]!.moves.move!(['VO']);
      }
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
    expect(radio.inventory.battery)
      .toBe(batteryBefore - BALANCE.communicationPrice.RADIO_NIGHTLY);
    expect(office.rendezvousKnowledge).toEqual({
      location: radio.rendezvousKnowledge?.location,
      learnedDay: 4,
      source: 'BULLETIN',
    });
    expect(office.bulletinNotebook).toHaveLength(1);
    expect(unaware.rendezvousKnowledge).toBeUndefined();
    expect(unaware.bulletinNotebook).toBeUndefined();
    const nightLog = clients[0]!.getState()?.log.find((entry) =>
      Boolean((entry.metadata as { paceMessages?: unknown } | undefined)?.paceMessages))?.metadata as {
      paceMessages?: Array<{ sender: string; method: string }>;
    } | undefined;
    expect(nightLog?.paceMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({ sender: 'SYSTEM', method: 'RADIO' }),
      expect.objectContaining({ sender: 'SYSTEM', method: 'BULLETIN' }),
    ]));
    clients.forEach((client) => client.stop());
  });

  it('reads a persistent bulletin through the reducer on entry and re-entry', () => {
    const multiplayer = Local();
    const clients = ['0', '1', '2', '3'].map((playerID) => Client({
      game: BlackoutGame,
      multiplayer,
      matchID: 'bulletin-reentry-reducer-test',
      playerID,
      numPlayers: 4,
    }));
    clients.forEach((client) => client.start());
    clients.forEach((client, index) => {
      const projected = client.getState()?.G as unknown as { you: { character: string } };
      const count = projected.you.character === 'STUDENT' ? 5 : 4;
      const methods = index === 0
        ? [...METHOD_IDS.slice(0, count - 1), 'BULLETIN']
        : METHOD_IDS.slice(0, count);
      client.moves.chooseMethods!(methods);
      client.moves.ready!();
    });

    for (const client of clients) client.moves.done!(true);
    clients[0]!.moves.postBulletin!('Persistent office notice');
    clients[0]!.moves.setRadioListen!(true);
    for (const client of clients) client.moves.ready!();

    expect(clients[0]!.getState()?.G.day).toBe(2);
    const afterNightOne = clients[0]!.getState();
    expect((afterNightOne?.G as unknown as {
      lastPhaseCompletion: { day: number; phase: string };
      you: { inbox: Array<{ text: string }> };
    }).lastPhaseCompletion).toMatchObject({ day: 1, phase: 'contact' });
    expect((afterNightOne?.G as unknown as { you: { inbox: Array<{ text: string }> } })
      .you.inbox.at(-1)?.text).toBe('The radio carried nothing new tonight.');
    const radioLog = afterNightOne?.log.find((entry) =>
      Boolean((entry.metadata as { paceRadioChoices?: unknown } | undefined)?.paceRadioChoices));
    expect((radioLog?.metadata as { paceRadioChoices: Array<{ outcome: string }> })
      .paceRadioChoices).toEqual([
        expect.objectContaining({ player: '0', outcome: 'LISTEN_SUCCESS', batteryBefore: 3 }),
        expect.objectContaining({ player: '1', outcome: 'SKIP', batteryBefore: expect.any(Number) }),
        expect.objectContaining({ player: '2', outcome: 'SKIP', batteryBefore: expect.any(Number) }),
        expect.objectContaining({ player: '3', outcome: 'SKIP', batteryBefore: expect.any(Number) }),
      ]);
    clients[1]!.moves.move!(['BRIDGE_S', 'BRIDGE_N']);
    clients[1]!.moves.move!(['VO']);
    const firstVisit = clients[1]!.getState()?.G as unknown as {
      you: { bulletinNotebook?: Array<{ text: string }>; location: string };
      radioChoiceEvidence?: unknown;
    };
    expect(firstVisit.you.location).toBe('VO');
    expect(firstVisit.you.bulletinNotebook?.map(({ text }) => text))
      .toEqual(['Persistent office notice']);
    expect(firstVisit.radioChoiceEvidence).toBeUndefined();

    for (const client of clients) client.moves.done!(true);
    for (const client of clients) client.moves.ready!();
    expect(clients[0]!.getState()?.G.day).toBe(3);

    clients[1]!.moves.move!(['TEMPLE']);
    clients[1]!.moves.move!(['VO']);
    const secondVisit = clients[1]!.getState()?.G as unknown as {
      you: { bulletinNotebook?: Array<{ text: string }>; location: string };
    };
    expect(secondVisit.you.location).toBe('VO');
    expect(secondVisit.you.bulletinNotebook?.map(({ text }) => text))
      .toEqual(['Persistent office notice']);
    clients.forEach((client) => client.stop());
  });

  it('plays all seven nights and ends with a one-star terminal reveal', () => {
    const multiplayer = Local();
    const clients = ['0', '1', '2', '3'].map((playerID) => Client({
      game: BlackoutGame,
      multiplayer,
      matchID: 'seven-night-game-test',
      playerID,
      numPlayers: 4,
    }));
    clients.forEach((client) => client.start());
    for (const client of clients) {
      const projected = client.getState()?.G as unknown as { you: { character: string } };
      client.moves.chooseMethods!(METHOD_IDS.slice(0, projected.you.character === 'STUDENT' ? 5 : 4));
      client.moves.ready!();
    }

    clients[0]!.moves.move!(['TEMPLE']);
    clients[0]!.moves.move!(['STORE']);
    for (const client of clients) client.moves.done!(true);
    for (const client of clients) client.moves.ready!();

    for (const day of [2, 3, 4, 5, 6, 7]) {
      expect(clients[0]!.getState()?.G.day).toBe(day);
      const publicState = clients[0]!.getState()?.G as unknown as {
        publicPlayers: Record<string, { ready: boolean }>;
        severedEdges: string[];
      };
      if (day >= 2) expect(publicState.severedEdges).toContain(DAY_2_EDGE);
      if (day >= 3) expect(publicState.severedEdges).toContain(BRIDGE_SPAN);
      if (day === 5) expect(publicState.publicPlayers['1']?.ready).toBe(false);
      const survivor = clients[0]!;
      while (true) {
        const view = survivor.getState()?.G as unknown as {
          localCache: { food: number };
          you: { actionsLeft: number; capacity: number; inventory: { food: number; battery: number } };
        };
        const room = view.you.capacity - view.you.inventory.food - view.you.inventory.battery;
        if (view.you.actionsLeft === 0 || room === 0 || view.localCache.food === 0) break;
        survivor.moves.scavenge!({ food: Math.min(2, room, view.localCache.food), battery: 0 });
      }
      for (const client of clients) {
        const view = client.getState()?.G as unknown as { you: { alive: boolean } };
        if (view.you.alive) client.moves.done!(true);
      }
      expect(clients[0]!.getState()?.ctx.phase).toBe('contact');
      if (day === 5) {
        const boundary = clients[0]!.getState()?.G as unknown as {
          publicPlayers: Record<string, { ready: boolean }>;
          lastPhaseCompletion: { day: number; phase: string; ready: Record<string, boolean> };
        };
        expect(boundary.publicPlayers['1']?.ready).toBe(false);
        expect(boundary.lastPhaseCompletion).toEqual({
          day: 5,
          phase: 'move',
          ready: { '0': true, '1': true, '2': true, '3': true },
        });
      }
      for (const client of clients) {
        const state = client.getState();
        const view = state?.G as unknown as { you: { alive: boolean } };
        if (!state?.ctx.gameover && view.you.alive) client.moves.ready!();
      }
    }

    for (const client of clients) {
      const state = client.getState();
      const view = state?.G as unknown as {
        day: number;
        terminalOutcome: { calculation: { stars: number; survivorCount: number }; players: Record<string, unknown> };
      };
      expect(state?.ctx.gameover).toBeTruthy();
      expect(view.day).toBe(7);
      expect(view.terminalOutcome.calculation).toMatchObject({ stars: 1, survivorCount: 1 });
      expect(Object.keys(view.terminalOutcome.players)).toHaveLength(4);
    }
    clients.forEach((client) => client.stop());
  });
});

function scenarioGame(name: string, configure: (G: TruthState) => void): Game<TruthState> {
  return {
    ...BlackoutGame,
    name,
    setup: ({ random }) => {
      const G = createInitialState(random);
      configure(G);
      return G;
    },
  };
}

function playEngineScenario(game: Game<TruthState>, matchID: string) {
  const multiplayer = Local();
  const clients = (['0', '1', '2', '3'] as PlayerID[]).map((playerID) => Client({
    game,
    multiplayer,
    matchID,
    playerID,
    numPlayers: 4,
  }));
  clients.forEach((client) => client.start());
  for (const client of clients) {
    const view = client.getState()?.G as unknown as { you: { character: string } };
    client.moves.chooseMethods!(METHOD_IDS.slice(0, view.you.character === 'STUDENT' ? 5 : 4));
    client.moves.ready!();
  }
  for (let day = 1; day <= 7 && !clients[0]!.getState()?.ctx.gameover; day += 1) {
    for (const client of clients) {
      const view = client.getState()?.G as unknown as { you: { alive: boolean } };
      if (view.you.alive) client.moves.done!(true);
    }
    for (const client of clients) {
      const state = client.getState();
      const view = state?.G as unknown as { you: { alive: boolean } };
      if (!state?.ctx.gameover && view.you.alive) client.moves.ready!();
    }
  }
  const outcomes = clients.map((client) => {
    const state = client.getState();
    expect(state?.ctx.gameover).toBeTruthy();
    return (state?.G as unknown as { terminalOutcome: unknown }).terminalOutcome;
  });
  clients.forEach((client) => client.stop());
  expect(outcomes.slice(1)).toEqual([outcomes[0], outcomes[0], outcomes[0]]);
  return outcomes[0] as {
    endedAfterNight: number;
    result: string;
    trueRendezvous: string;
    calculation: { stars: number; survivorCount: number };
  };
}

describe('boardgame.io terminal lifecycle', () => {
  it('ends in immediate zero-star loss when Night 1 kills everyone', () => {
    const game = scenarioGame('blackout-total-loss', (G) => {
      for (const player of Object.values(G.players)) {
        player.inventory = { food: 0, battery: 0 };
        player.starvationNights = 1;
      }
    });
    expect(playEngineScenario(game, 'engine-total-loss')).toMatchObject({
      result: 'LOSS', endedAfterNight: 1,
      calculation: { survivorCount: 0, stars: 0 },
    });
  });

  it('scores two stars through the engine when all four survive apart', () => {
    const game = scenarioGame('blackout-two-stars', (G) => {
      G.rendezvous = 'TEA';
      G.scheduleProgress = { appliedDays: [], rendezvousChanged: true };
      for (const player of Object.values(G.players)) {
        player.location = 'STORE';
        player.inventory = { food: 7, battery: 0 };
      }
    });
    expect(playEngineScenario(game, 'engine-two-stars')).toMatchObject({
      endedAfterNight: 7, trueRendezvous: 'TEA',
      calculation: { survivorCount: 4, stars: 2 },
    });
  });

  it('scores three stars through the engine after every exposure night', () => {
    const game = scenarioGame('blackout-three-stars', (G) => {
      G.rendezvous = 'TEA';
      G.scheduleProgress = { appliedDays: [], rendezvousChanged: true };
      for (const player of Object.values(G.players)) {
        player.location = 'TEA';
        player.inventory = { food: 10, battery: 0 };
      }
    });
    expect(playEngineScenario(game, 'engine-three-stars')).toMatchObject({
      endedAfterNight: 7, trueRendezvous: 'TEA',
      calculation: { survivorCount: 4, stars: 3 },
    });
  });
});
