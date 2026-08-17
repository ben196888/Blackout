import type { Game, MoveFn } from 'boardgame.io';
import { ActivePlayers } from 'boardgame.io/core';
import { ACTIONS_PER_DAY, GAME_NAME, METHOD_IDS, PLAYER_COUNT } from '../constants';
import type {
  CommsPlanInput,
  MessageOutcome,
  MethodId,
  PlayerID,
  PlayerViewState,
  RadioChoiceEvidence,
  TruthState,
} from '../types';
import {
  cancelAllRoadProposals,
  clearRoad,
  dropItems,
  finishMove,
  movePlayer,
  scavenge,
} from './actions';
import { exchange, sendMessage, senderMethodStatus } from './comms';
import { requireRule, withErrorBoundary } from './errors';
import { leaderBroadcast, postBulletin, setRadioListen } from './facilities';
import { applyScheduledDay, resolveScheduledNight } from './schedule';
import { createInitialState } from './setup';

const ids: PlayerID[] = ['0', '1', '2', '3'];

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

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

const saveCommsPlan: MoveFn<TruthState> = ({ G, playerID }, input: CommsPlanInput) => {
  const player = actor(G, playerID);
  requireRule(!player.ready, 'READY_LOCKED');
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

const sendPlanningMessage: MoveFn<TruthState> = ({ G, playerID, log }, rawText: string) => {
  const player = actor(G, playerID);
  requireRule(!player.ready, 'READY_LOCKED');
  requireRule(typeof rawText === 'string' && rawText.trim().length > 0, 'INVALID_MESSAGE');
  const author = playerID as PlayerID;
  const text = rawText.trim();
  G.planningMessages.push({ id: G.planningMessages.length + 1, author, text });
  const outcome = {
    day: G.day,
    sender: author,
    method: 'PLANNING' as const,
    target: null,
    rawText: text,
    deliveredText: text,
    recipients: ids.filter((id) => id !== author),
    dropped: [],
    excluded: [],
    truncated: false,
  };
  (G.messageOutcomes ??= []).push(outcome);
  log.setMetadata({ paceMessage: structuredClone(outcome) });
};

const readyPlanning: MoveFn<TruthState> = ({ G, playerID }) => {
  const player = actor(G, playerID);
  requireRule(!player.ready, 'READY_LOCKED');
  const required = player.character === 'STUDENT' ? 5 : 4;
  requireRule(player.methods.length === required, 'METHODS_REQUIRED');
  player.ready = true;
};

const readyContact: MoveFn<TruthState> = ({ G, playerID, random, log }) => {
  const player = actor(G, playerID);
  requireRule(player.alive, 'PLAYER_DEAD');
  requireRule(!player.ready, 'READY_LOCKED');
  player.ready = true;
  if (!livingReady(G)) return;

  recordPhaseCompletion(G, 'contact');
  const firstNightMessage = G.messageOutcomes?.length ?? 0;
  const firstRadioChoice = G.radioChoiceEvidence?.length ?? 0;
  const outcome = resolveScheduledNight(G, random);
  const nightMessages = G.messageOutcomes?.slice(firstNightMessage) ?? [];
  const radioChoices = G.radioChoiceEvidence?.slice(firstRadioChoice) ?? [];
  const metadata: {
    paceMessages?: MessageOutcome[];
    paceRadioChoices?: RadioChoiceEvidence[];
  } = {};
  if (nightMessages.length) metadata.paceMessages = cloneSerializable(nightMessages);
  if (radioChoices.length) metadata.paceRadioChoices = cloneSerializable(radioChoices);
  if (Object.keys(metadata).length) log.setMetadata(metadata);
  if (!outcome) G.day += 1;
};

function livingReady(G: TruthState) {
  return ids.every((id) => !G.players[id].alive || G.players[id].ready);
}

function recordPhaseCompletion(
  G: TruthState,
  phase: 'planning' | 'move' | 'contact',
): void {
  G.lastPhaseCompletion = {
    day: G.day,
    phase,
    ready: { '0': true, '1': true, '2': true, '3': true },
  };
}

export function playerView({ G, ctx, playerID }: {
  G: TruthState;
  ctx?: { phase?: string | null };
  playerID?: string | null;
}): PlayerViewState {
  const quorumComplete = livingReady(G);
  const publicPlayers = Object.fromEntries(
    ids.map((id) => {
      const player = G.players[id];
      return [id, {
        character: player.character,
        methods: [...player.methods],
        hasFood: player.inventory.food > 0,
        hasBattery: player.inventory.battery > 0,
        actionsLeft: player.alive
          ? player.actionsLeft
          : ctx?.phase === 'contact' ? 0 : ACTIONS_PER_DAY,
        ready: player.ready || (!player.alive && quorumComplete),
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
    planningMessages: structuredClone(G.planningMessages),
    severedEdges: [...G.severedEdges],
    localCache: you ? { ...G.caches[you.location] } : null,
    methodConnectivity,
    terminalOutcome: G.terminalOutcome ? structuredClone(G.terminalOutcome) : null,
    lastPhaseCompletion: G.lastPhaseCompletion
      ? structuredClone(G.lastPhaseCompletion)
      : null,
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
  endIf: ({ G }) => G.terminalOutcome,
  phases: {
    planning: {
      start: true,
      next: 'move',
      moves: {
        chooseMethods: { move: withErrorBoundary(chooseMethods), client: false },
        saveCommsPlan: { move: withErrorBoundary(saveCommsPlan), client: false },
        sendPlanningMessage: { move: withErrorBoundary(sendPlanningMessage), client: false, redact: true },
        ready: { move: withErrorBoundary(readyPlanning), client: false },
      },
      endIf: ({ G }) => ids.every((id) => G.players[id].ready),
      onEnd: ({ G }) => {
        recordPhaseCompletion(G, 'planning');
        G.commsPlan.locked = true;
        G.day = 1;
        for (const id of ids) G.players[id].ready = false;
      },
      turn: { activePlayers: ActivePlayers.ALL },
    },
    move: {
      next: 'contact',
      onBegin: ({ G }) => {
        applyScheduledDay(G);
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
        recordPhaseCompletion(G, 'move');
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
        setRadioListen: { move: withErrorBoundary(setRadioListen), client: false },
        postBulletin: { move: withErrorBoundary(postBulletin), client: false, redact: true },
        leaderBroadcast: { move: withErrorBoundary(leaderBroadcast), client: false, redact: true },
        ready: { move: withErrorBoundary(readyContact), client: false },
      },
      endIf: ({ G }) => livingReady(G),
      onEnd: ({ G }) => {
        for (const id of ids) G.players[id].ready = false;
      },
      turn: { activePlayers: ActivePlayers.ALL },
    },
  },
};
