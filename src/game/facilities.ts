import type { MoveFn } from 'boardgame.io';
import { BALANCE } from '../constants';
import type {
  BulletinBoardId,
  BulletinPost,
  MessageOutcome,
  NodeId,
  PlayerID,
  RadioChoiceEvidence,
  TruthState,
} from '../types';
import { requireRule } from './errors';
import { distancesFrom } from './map';

const PLAYER_IDS: PlayerID[] = ['0', '1', '2', '3'];
export const BULLETIN_BOARD_IDS: BulletinBoardId[] = ['VO', 'SCHOOL', 'COOP', 'FOREST'];
export const RADIO_SILENT_NOTICE = 'The radio went silent.';
export const RADIO_NO_NEWS_NOTICE = 'The radio carried nothing new tonight.';

/** JSON-compatible game data may be an Immer Proxy inside a boardgame.io reducer. */
function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function actor(G: TruthState, playerID: string): { id: PlayerID; player: TruthState['players'][PlayerID] } {
  requireRule(PLAYER_IDS.includes(playerID as PlayerID), 'INVALID_PLAYER');
  const id = playerID as PlayerID;
  return { id, player: G.players[id] };
}

function isBoard(node: NodeId): node is BulletinBoardId {
  return BULLETIN_BOARD_IDS.includes(node as BulletinBoardId);
}

export function ensureBulletinBoards(G: TruthState): Record<BulletinBoardId, BulletinPost[]> {
  return G.bulletinBoards ??= { VO: [], SCHOOL: [], COOP: [], FOREST: [] };
}

function rememberPost(G: TruthState, playerID: PlayerID, post: BulletinPost): void {
  const notebook = G.players[playerID].bulletinNotebook ??= [];
  if (!notebook.some(({ id }) => id === post.id)) notebook.push(cloneSerializable(post));
  if (post.official) {
    const existing = G.players[playerID].rendezvousKnowledge;
    if (existing?.location !== G.rendezvous || existing.learnedDay < G.day) {
      G.players[playerID].rendezvousKnowledge = {
        location: G.rendezvous,
        learnedDay: G.day,
        source: 'BULLETIN',
      };
    }
  }
}

function appendPost(
  G: TruthState,
  board: BulletinBoardId,
  author: PlayerID | 'SYSTEM',
  text: string,
  official: boolean,
): BulletinPost {
  const boards = ensureBulletinBoards(G);
  const post: BulletinPost = {
    id: `${board}:${boards[board].length + 1}`,
    board,
    day: G.day,
    author,
    text,
    official,
  };
  boards[board].push(post);
  for (const id of PLAYER_IDS) {
    const visitor = G.players[id];
    if (visitor.alive && visitor.location === board) rememberPost(G, id, post);
  }
  return post;
}

function outcomeForPost(G: TruthState, author: PlayerID | 'SYSTEM', post: BulletinPost): MessageOutcome {
  const recipients = PLAYER_IDS.filter((id) =>
    G.players[id].alive && G.players[id].location === post.board);
  return {
    day: G.day,
    sender: author,
    method: 'BULLETIN',
    target: post.board,
    rawText: post.text,
    deliveredText: post.text,
    recipients,
    dropped: [],
    excluded: [],
    truncated: false,
  };
}

/** Set or clear the owner's private nightly listen intent during Contact. */
export function setRadioListenIntent(G: TruthState, playerID: PlayerID, listening: boolean): void {
  const player = G.players[playerID];
  requireRule(player?.alive, 'PLAYER_DEAD');
  requireRule(typeof listening === 'boolean', 'INVALID_RADIO_LISTEN');
  requireRule(!player.ready, 'READY_LOCKED');
  player.radioListen = listening;
}

export const setRadioListen: MoveFn<TruthState> = ({ G, playerID }, listening: boolean) => {
  const { id } = actor(G, playerID);
  setRadioListenIntent(G, id, listening);
};

/**
 * Resolve all private listen intents at night. Each successful listen costs exactly
 * one Battery, including Day 5. Day 4 listeners learn the current true rendezvous.
 */
export function resolveNightRadio(G: TruthState): BulletinPost | undefined {
  const successfulListeners: PlayerID[] = [];
  const price = BALANCE.communicationPrice.RADIO_NIGHTLY;
  for (const id of PLAYER_IDS) {
    const player = G.players[id];
    const listened = player.radioListen;
    const batteryBefore = player.inventory.battery;
    player.radioListen = false;
    let evidence: RadioChoiceEvidence;
    if (!listened) {
      evidence = {
        day: G.day,
        player: id,
        outcome: 'SKIP',
        reason: player.alive ? 'NOT_SELECTED' : 'PLAYER_DEAD',
        batteryBefore,
        batteryCharged: 0,
      };
      (G.radioChoiceEvidence ??= []).push(evidence);
      continue;
    }
    if (!player.alive) {
      evidence = {
        day: G.day,
        player: id,
        outcome: 'LISTEN_FAILURE',
        reason: 'PLAYER_DEAD',
        batteryBefore,
        batteryCharged: 0,
      };
      (G.radioChoiceEvidence ??= []).push(evidence);
      continue;
    }
    if (player.inventory.battery < price) {
      player.inbox.push({ day: G.day, from: 'SYSTEM', method: 'RADIO', text: RADIO_SILENT_NOTICE });
      (G.messageOutcomes ??= []).push({
        day: G.day,
        sender: 'SYSTEM',
        method: 'RADIO',
        target: id,
        rawText: RADIO_SILENT_NOTICE,
        deliveredText: RADIO_SILENT_NOTICE,
        recipients: [id],
        dropped: [],
        excluded: [],
        truncated: false,
      });
      evidence = {
        day: G.day,
        player: id,
        outcome: 'LISTEN_FAILURE',
        reason: 'INSUFFICIENT_BATTERY',
        batteryBefore,
        batteryCharged: 0,
      };
      (G.radioChoiceEvidence ??= []).push(evidence);
      continue;
    }
    player.inventory.battery -= price;
    if (G.day === 4) {
      successfulListeners.push(id);
      player.rendezvousKnowledge = {
        location: G.rendezvous,
        learnedDay: G.day,
        source: 'RADIO',
      };
    } else {
      player.inbox.push({
        day: G.day,
        from: 'SYSTEM',
        method: 'RADIO',
        text: RADIO_NO_NEWS_NOTICE,
      });
      (G.messageOutcomes ??= []).push({
        day: G.day,
        sender: 'SYSTEM',
        method: 'RADIO',
        target: id,
        rawText: RADIO_NO_NEWS_NOTICE,
        deliveredText: RADIO_NO_NEWS_NOTICE,
        recipients: [id],
        dropped: [],
        excluded: [],
        truncated: false,
      });
    }
    evidence = {
      day: G.day,
      player: id,
      outcome: 'LISTEN_SUCCESS',
      reason: G.day === 4 ? 'RENDEZVOUS_RECEIVED' : 'NO_NEW_BROADCAST',
      batteryBefore,
      batteryCharged: price,
    };
    (G.radioChoiceEvidence ??= []).push(evidence);
  }

  if (G.day !== 4) return undefined;
  const announcement = `Official rendezvous: ${G.rendezvous}`;
  if (successfulListeners.length) {
    (G.messageOutcomes ??= []).push({
      day: G.day,
      sender: 'SYSTEM',
      method: 'RADIO',
      target: null,
      rawText: announcement,
      deliveredText: announcement,
      recipients: successfulListeners,
      dropped: [],
      excluded: [],
      truncated: false,
    });
  }
  const boards = ensureBulletinBoards(G);
  const existing = boards.VO.find((post) => post.official && post.day === 4);
  if (existing) return existing;
  const post = appendPost(
    G,
    'VO',
    'SYSTEM',
    announcement,
    true,
  );
  (G.messageOutcomes ??= []).push(outcomeForPost(G, 'SYSTEM', post));
  return post;
}

/** Append a player-authored post to the board at their current location. */
export function appendBulletinPost(G: TruthState, playerID: PlayerID, text: string): BulletinPost {
  const player = G.players[playerID];
  requireRule(player?.alive, 'PLAYER_DEAD');
  requireRule(!player.ready, 'READY_LOCKED');
  requireRule(player.methods.includes('BULLETIN'), 'METHOD_NOT_HELD');
  requireRule(isBoard(player.location), 'NO_BULLETIN_BOARD');
  requireRule(typeof text === 'string' && text.trim().length > 0, 'INVALID_MESSAGE');
  return appendPost(G, player.location, playerID, text.trim(), false);
}

export const postBulletin: MoveFn<TruthState> = ({ G, playerID, log }, text: string) => {
  const { id } = actor(G, playerID);
  const post = appendBulletinPost(G, id, text);
  const outcome = outcomeForPost(G, id, post);
  (G.messageOutcomes ??= []).push(outcome);
  log.setMetadata({ paceMessage: cloneSerializable(outcome) });
};

/** Read the complete local board into the living visitor's private durable notebook. */
export function readCurrentBulletin(G: TruthState, playerID: PlayerID): BulletinPost[] {
  const player = G.players[playerID];
  requireRule(player?.alive, 'PLAYER_DEAD');
  requireRule(isBoard(player.location), 'NO_BULLETIN_BOARD');
  const posts = ensureBulletinBoards(G)[player.location];
  for (const post of posts) rememberPost(G, playerID, post);
  return cloneSerializable(posts);
}

/** Resolve a one-way Village Office broadcaster message with no sender receipt. */
export function broadcastFromVillageOffice(
  G: TruthState,
  playerID: PlayerID,
  text: string,
): MessageOutcome {
  const leader = G.players[playerID];
  requireRule(leader?.alive, 'PLAYER_DEAD');
  requireRule(!leader.ready, 'READY_LOCKED');
  requireRule(leader.character === 'VILLAGE_LEADER', 'NOT_VILLAGE_LEADER');
  requireRule(leader.location === 'VO', 'NOT_AT_VILLAGE_OFFICE');
  requireRule(leader.villageBroadcastDay !== G.day, 'VILLAGE_BROADCAST_USED');
  requireRule(typeof text === 'string' && text.length > 0, 'INVALID_MESSAGE');
  const rawText = text;
  const deliveredText = Array.from(text).slice(0, BALANCE.payloadCap.VILLAGE_BROADCAST).join('');
  const recipients: PlayerID[] = [];
  const excluded: MessageOutcome['excluded'] = [];
  const coverage = distancesFrom('VO', G.severedEdges);
  leader.villageBroadcastDay = G.day;
  for (const id of PLAYER_IDS) {
    if (id === playerID) continue;
    const recipient = G.players[id];
    if (!recipient.alive) {
      excluded.push({ player: id, reason: 'DEAD' });
      continue;
    }
    if (!Number.isFinite(coverage[recipient.location])) {
      excluded.push({ player: id, reason: 'NOT_CONNECTED' });
      continue;
    }
    recipients.push(id);
    recipient.inbox.push({
      day: G.day,
      from: playerID,
      method: 'VILLAGE_BROADCAST',
      text: deliveredText,
    });
  }
  const outcome: MessageOutcome = {
    day: G.day,
    sender: playerID,
    method: 'VILLAGE_BROADCAST',
    target: null,
    rawText,
    deliveredText,
    recipients,
    dropped: [],
    excluded,
    truncated: Array.from(rawText).length > BALANCE.payloadCap.VILLAGE_BROADCAST,
  };
  (G.messageOutcomes ??= []).push(outcome);
  return outcome;
}

export const leaderBroadcast: MoveFn<TruthState> = ({ G, playerID, log }, text: string) => {
  const { id } = actor(G, playerID);
  const outcome = broadcastFromVillageOffice(G, id, text);
  log.setMetadata({ paceMessage: cloneSerializable(outcome) });
};
