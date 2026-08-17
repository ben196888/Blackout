import type { Game, MoveFn } from 'boardgame.io';
import { ActivePlayers } from 'boardgame.io/core';
import { ACTIONS_PER_DAY, GAME_NAME, METHOD_IDS, PLAYER_COUNT } from '../constants';
import type { CommsPlanInput, MethodId, PlayerID, PlayerViewState, TruthState } from '../types';
import {
  cancelAllRoadProposals,
  clearRoad,
  dropItems,
  finishMove,
  movePlayer,
  resolveNightEconomy,
  scavenge,
} from './actions';
import { exchange, sendMessage, senderMethodStatus } from './comms';
import { requireRule, withErrorBoundary } from './errors';
import { createInitialState } from './setup';

const ids: PlayerID[] = ['0', '1', '2', '3'];

function actor(G: TruthState, playerID: string) {
  requireRule(ids.includes(playerID as PlayerID), 'INVALID_PLAYER');
  return G.players[playerID as PlayerID];
}

const chooseMethods: MoveFn<TruthState> = ({ G, playerID }, methods: MethodId[]) => {
  const player = actor(G, playerID);
  requireRule(!player.ready, 'READY_LOCKED');
  requireRule(Array.isArray(methods), 'INVALID_METHODS');
  const unique = [...new Set(methods)];
  requireRule(unique.length === methods.length, 'DUPLICATE_METHOD');
  requireRule(unique.every((method) => METHOD_IDS.includes(method)), 'UNKNOWN_METHOD');
  const required = player.character === 'STUDENT' ? 5 : 4;
  requireRule(unique.length === required, 'WRONG_METHOD_COUNT');
  player.methods = unique;
};

const saveCommsPlan: MoveFn<TruthState> = ({ G }, input: CommsPlanInput) => {
  requireRule(!G.commsPlan.locked, 'PLAN_LOCKED');
  requireRule(input.expectedRevision === G.commsPlan.revision, 'STALE_REVISION');
  G.commsPlan = {
    revision: G.commsPlan.revision + 1,
    fallbackRendezvous: 'SCHOOL',
    fallbackProtocol: input.fallbackProtocol.trim().slice(0, 500),
    reportingShorthand: input.reportingShorthand.trim().slice(0, 500),
    notes: input.notes.trim().slice(0, 1000),
    locked: false,
  };
};

const readyPlanning: MoveFn<TruthState> = ({ G, playerID }) => {
  const player = actor(G, playerID);
  const required = player.character === 'STUDENT' ? 5 : 4;
  requireRule(player.methods.length === required, 'METHODS_REQUIRED');
  player.ready = true;
};

const readyContact: MoveFn<TruthState> = ({ G, playerID }) => {
  const player = actor(G, playerID);
  requireRule(player.alive, 'PLAYER_DEAD');
  player.ready = true;
};

function livingReady(G: TruthState) {
  return ids.every((id) => !G.players[id].alive || G.players[id].ready);
}

export function playerView({ G, playerID }: { G: TruthState; playerID?: string | null }): PlayerViewState {
  const publicPlayers = Object.fromEntries(
    ids.map((id) => {
      const player = G.players[id];
      return [id, {
        character: player.character,
        methods: [...player.methods],
        hasFood: player.inventory.food > 0,
        hasBattery: player.inventory.battery > 0,
        actionsLeft: player.actionsLeft,
        ready: player.ready,
      }];
    }),
  ) as PlayerViewState['publicPlayers'];
  const you = playerID && ids.includes(playerID as PlayerID)
    ? structuredClone(G.players[playerID as PlayerID])
    : null;
  const methodConnectivity = playerID && ids.includes(playerID as PlayerID)
    ? Object.fromEntries(G.players[playerID as PlayerID].methods.map((method) => [
        method,
        senderMethodStatus(G, playerID as PlayerID, method),
      ]))
    : {};
  return {
    day: G.day,
    publicRendezvous: 'SCHOOL',
    publicPlayers,
    commsPlan: structuredClone(G.commsPlan),
    severedEdges: [...G.severedEdges],
    startingLocations: { '0': 'VO', '1': 'SCHOOL', '2': 'COOP', '3': 'FOREST' },
    localCache: you ? { ...G.caches[you.location] } : null,
    methodConnectivity,
    you,
  };
}

export const BlackoutGame: Game<TruthState> = {
  name: GAME_NAME,
  minPlayers: PLAYER_COUNT,
  maxPlayers: PLAYER_COUNT,
  disableUndo: true,
  setup: ({ random }) => createInitialState(random),
  playerView,
  phases: {
    planning: {
      start: true,
      next: 'move',
      moves: {
        chooseMethods: { move: withErrorBoundary(chooseMethods), client: false },
        saveCommsPlan: { move: withErrorBoundary(saveCommsPlan), client: false },
        ready: { move: withErrorBoundary(readyPlanning), client: false },
      },
      endIf: ({ G }) => ids.every((id) => G.players[id].ready),
      onEnd: ({ G }) => {
        G.commsPlan.locked = true;
        G.day = 1;
        for (const id of ids) G.players[id].ready = false;
      },
      turn: { activePlayers: ActivePlayers.ALL },
    },
    move: {
      next: 'contact',
      onBegin: ({ G }) => {
        for (const id of ids) {
          G.players[id].actionsLeft = G.players[id].alive ? ACTIONS_PER_DAY : 0;
          G.players[id].ready = false;
        }
      },
      moves: {
        move: { move: withErrorBoundary(movePlayer), client: false },
        scavenge: { move: withErrorBoundary(scavenge), client: false },
        dropItems: { move: withErrorBoundary(dropItems), client: false },
        clearRoad: { move: withErrorBoundary(clearRoad), client: false },
        done: { move: withErrorBoundary(finishMove), client: false },
      },
      endIf: ({ G }) => livingReady(G),
      onEnd: ({ G }) => {
        cancelAllRoadProposals(G);
        for (const id of ids) G.players[id].ready = false;
      },
      turn: { activePlayers: ActivePlayers.ALL },
    },
    contact: {
      next: 'move',
      onBegin: ({ G }) => {
        for (const id of ids) G.players[id].ready = false;
      },
      moves: {
        sendMessage: { move: withErrorBoundary(sendMessage), client: false, redact: true },
        exchange: { move: withErrorBoundary(exchange), client: false, redact: true },
        ready: { move: withErrorBoundary(readyContact), client: false },
      },
      endIf: ({ G }) => livingReady(G),
      onEnd: ({ G }) => {
        resolveNightEconomy(G);
        G.day += 1;
        for (const id of ids) G.players[id].ready = false;
      },
      turn: { activePlayers: ActivePlayers.ALL },
    },
  },
};
