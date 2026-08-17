import type { MoveFn } from 'boardgame.io';
import { BALANCE } from '../constants';
import type {
  DailyCommsUsage,
  DeliveryMethodId,
  Inventory,
  MessageOutcome,
  MethodId,
  NodeId,
  PlayerID,
  TruthState,
} from '../types';
import { requireRule } from './errors';
import { distancesFrom, MAP_NODES } from './map';

const PLAYER_IDS: PlayerID[] = ['0', '1', '2', '3'];
const INFRASTRUCTURE_METHODS = ['MOBILE_DATA', 'MOBILE_VOICE', 'SMS'] as const;

export interface MethodAvailability {
  up: boolean;
  dropRate: number;
  coverage: 'GLOBAL' | 'DAY_6_ZONES' | 'ENDPOINTS' | 'LOCAL';
}

export interface MethodSpec {
  id: DeliveryMethodId;
  target: 'PLAYER' | 'NODE' | 'HERE';
  reach: number | 'ANY';
  relayable: boolean;
  audience: 'ADDRESSEE' | 'IN_RANGE' | 'AT_NODE' | 'ASYNC_AT_NODE';
  payloadCap: number | null;
  batteryPerSends: number | null;
  dailyFirstUseBattery: number | null;
  infraDependent: boolean;
  availability: Record<number, MethodAvailability>;
}

const down = (coverage: MethodAvailability['coverage'] = 'GLOBAL'): MethodAvailability => ({
  up: false,
  dropRate: 0,
  coverage,
});
const up = (
  coverage: MethodAvailability['coverage'],
  dropRate = 0,
): MethodAvailability => ({ up: true, dropRate, coverage });
const everyDay = (availability: MethodAvailability): Record<number, MethodAvailability> =>
  Object.fromEntries(Array.from({ length: 7 }, (_, index) => [index + 1, availability]));

/** The complete method pool and seven-day schedule, including unchosen face-to-face. */
export const METHOD_SPECS: Record<DeliveryMethodId, MethodSpec> = {
  MOBILE_DATA: {
    id: 'MOBILE_DATA', target: 'PLAYER', reach: 'ANY', relayable: false,
    audience: 'ADDRESSEE', payloadCap: null, batteryPerSends: null,
    dailyFirstUseBattery: BALANCE.communicationPrice.INFRASTRUCTURE_FIRST_USE, infraDependent: true,
    availability: {
      1: down(), 2: down(), 3: down(), 4: down(), 5: down(),
      6: up('DAY_6_ZONES'), 7: down(),
    },
  },
  MOBILE_VOICE: {
    id: 'MOBILE_VOICE', target: 'PLAYER', reach: 'ANY', relayable: false,
    audience: 'ADDRESSEE', payloadCap: null, batteryPerSends: null,
    dailyFirstUseBattery: BALANCE.communicationPrice.INFRASTRUCTURE_FIRST_USE, infraDependent: true,
    availability: {
      1: up('GLOBAL', BALANCE.dropRate.MOBILE_VOICE_DAY_1), 2: down(), 3: down(), 4: down(), 5: down(),
      6: down(), 7: down(),
    },
  },
  SMS: {
    id: 'SMS', target: 'PLAYER', reach: 'ANY', relayable: false,
    audience: 'ADDRESSEE', payloadCap: BALANCE.payloadCap.SMS, batteryPerSends: null,
    dailyFirstUseBattery: BALANCE.communicationPrice.INFRASTRUCTURE_FIRST_USE, infraDependent: true,
    availability: {
      1: up('GLOBAL'), 2: up('GLOBAL', BALANCE.dropRate.SMS_DAY_2), 3: down(), 4: down(),
      5: down(), 6: down(), 7: down(),
    },
  },
  LANDLINE: {
    id: 'LANDLINE', target: 'NODE', reach: 'ANY', relayable: false,
    audience: 'AT_NODE', payloadCap: null, batteryPerSends: null,
    dailyFirstUseBattery: null, infraDependent: true,
    availability: {
      1: up('ENDPOINTS'), 2: up('ENDPOINTS'), 3: down('ENDPOINTS'),
      4: down('ENDPOINTS'), 5: down('ENDPOINTS'), 6: down('ENDPOINTS'),
      7: down('ENDPOINTS'),
    },
  },
  MESH: {
    id: 'MESH', target: 'PLAYER', reach: 1, relayable: true,
    audience: 'ADDRESSEE', payloadCap: BALANCE.payloadCap.MESH,
    batteryPerSends: BALANCE.communicationPrice.MESH_SENDS_PER_BATTERY,
    dailyFirstUseBattery: null, infraDependent: false,
    availability: everyDay(up('LOCAL')),
  },
  WALKIE: {
    id: 'WALKIE', target: 'HERE', reach: 1, relayable: false,
    audience: 'IN_RANGE', payloadCap: BALANCE.payloadCap.WALKIE,
    batteryPerSends: BALANCE.communicationPrice.WALKIE_SENDS_PER_BATTERY,
    dailyFirstUseBattery: null, infraDependent: false,
    availability: everyDay(up('LOCAL')),
  },
  BULLETIN: {
    id: 'BULLETIN', target: 'NODE', reach: 'ANY', relayable: false,
    audience: 'ASYNC_AT_NODE', payloadCap: null, batteryPerSends: null,
    dailyFirstUseBattery: null, infraDependent: false,
    availability: everyDay(up('LOCAL')),
  },
  FACE_TO_FACE: {
    id: 'FACE_TO_FACE', target: 'HERE', reach: 0, relayable: false,
    audience: 'AT_NODE', payloadCap: null, batteryPerSends: null,
    dailyFirstUseBattery: null, infraDependent: false,
    availability: everyDay(up('LOCAL')),
  },
};

export interface SendRequest {
  method: DeliveryMethodId;
  target: PlayerID | NodeId | null;
  text: string;
}

export type SenderSendResult =
  | { state: 'sent' }
  | { state: 'delivered'; recipients: PlayerID[] };

function usageFor(G: TruthState, playerID: PlayerID): DailyCommsUsage {
  const player = G.players[playerID];
  if (!player.commsUsage || player.commsUsage.day !== G.day) {
    player.commsUsage = {
      day: G.day,
      sends: {},
      infrastructureCharged: {},
      landlineDialed: false,
    };
  }
  return player.commsUsage;
}

function methodAvailability(G: TruthState, method: DeliveryMethodId): MethodAvailability {
  return METHOD_SPECS[method].availability[G.day] ?? down();
}

function inDaySixZone(G: TruthState, node: NodeId): boolean {
  return distancesFrom('SCHOOL', G.severedEdges)[node] <= 2
    || distancesFrom(G.rendezvous, G.severedEdges)[node] <= 2;
}

function senderConnected(G: TruthState, playerID: PlayerID, method: DeliveryMethodId): boolean {
  const player = G.players[playerID];
  const availability = methodAvailability(G, method);
  if (!availability.up) return false;
  if (method === 'MOBILE_DATA') return inDaySixZone(G, player.location);
  if (method === 'LANDLINE') return MAP_NODES[player.location].landline === true;
  return true;
}

function adjacentWithin(node: NodeId, target: NodeId, radius: number, severed: readonly string[]): boolean {
  return distancesFrom(node, severed)[target] <= radius;
}

function hasLivingMeshRelay(G: TruthState, sender: PlayerID, recipient: PlayerID): boolean {
  const senderNode = G.players[sender].location;
  const recipientNode = G.players[recipient].location;
  return PLAYER_IDS.some((relayID) => {
    if (relayID === sender || relayID === recipient) return false;
    const relay = G.players[relayID];
    return relay.alive
      && adjacentWithin(senderNode, relay.location, 1, G.severedEdges)
      && adjacentWithin(relay.location, recipientNode, 1, G.severedEdges);
  });
}

function recipientConnected(
  G: TruthState,
  senderID: PlayerID,
  recipientID: PlayerID,
  method: DeliveryMethodId,
): boolean {
  const sender = G.players[senderID];
  const recipient = G.players[recipientID];
  if (!methodAvailability(G, method).up) return false;
  if (method === 'MOBILE_DATA') return inDaySixZone(G, recipient.location);
  if (method === 'LANDLINE') return MAP_NODES[recipient.location].landline === true;
  if (method === 'MESH') {
    if (sender.character === 'STUDENT') {
      return adjacentWithin(sender.location, recipient.location, 2, G.severedEdges);
    }
    return adjacentWithin(sender.location, recipient.location, 1, G.severedEdges)
      || hasLivingMeshRelay(G, senderID, recipientID);
  }
  return true;
}

function batteryCost(G: TruthState, playerID: PlayerID, method: DeliveryMethodId): number {
  if (method === 'FACE_TO_FACE' || method === 'LANDLINE' || method === 'BULLETIN') return 0;
  const spec = METHOD_SPECS[method];
  const usage = usageFor(G, playerID);
  const multiplier = G.day === 5 ? BALANCE.communicationPrice.DAY_5_MULTIPLIER : 1;
  if (INFRASTRUCTURE_METHODS.includes(method as (typeof INFRASTRUCTURE_METHODS)[number])) {
    const infraMethod = method as (typeof INFRASTRUCTURE_METHODS)[number];
    return usage.infrastructureCharged[infraMethod] ? 0 : (spec.dailyFirstUseBattery ?? 0) * multiplier;
  }
  const sends = usage.sends[method as MethodId] ?? 0;
  return spec.batteryPerSends && sends % spec.batteryPerSends === 0 ? multiplier : 0;
}

function chargeSend(G: TruthState, playerID: PlayerID, method: DeliveryMethodId): void {
  const player = G.players[playerID];
  const usage = usageFor(G, playerID);
  if (method === 'LANDLINE') {
    requireRule(!usage.landlineDialed, 'LANDLINE_DIAL_USED');
    usage.landlineDialed = true;
    usage.sends.LANDLINE = (usage.sends.LANDLINE ?? 0) + 1;
    return;
  }
  const cost = batteryCost(G, playerID, method);
  requireRule(player.inventory.battery >= cost, 'INSUFFICIENT_BATTERY');
  player.inventory.battery -= cost;
  if (method === 'FACE_TO_FACE' || method === 'BULLETIN') return;
  usage.sends[method] = (usage.sends[method] ?? 0) + 1;
  if (INFRASTRUCTURE_METHODS.includes(method as (typeof INFRASTRUCTURE_METHODS)[number])) {
    usage.infrastructureCharged[method as (typeof INFRASTRUCTURE_METHODS)[number]] = true;
  }
}

function audienceFor(G: TruthState, senderID: PlayerID, request: SendRequest): PlayerID[] {
  const sender = G.players[senderID];
  if (request.method === 'FACE_TO_FACE') {
    return PLAYER_IDS.filter((id) => id !== senderID && G.players[id].location === sender.location);
  }
  if (request.method === 'WALKIE') {
    const range = sender.character === 'RESERVIST' ? 2 : 1;
    return PLAYER_IDS.filter((id) => id !== senderID
      && adjacentWithin(sender.location, G.players[id].location, range, G.severedEdges));
  }
  if (request.method === 'LANDLINE') {
    requireRule(typeof request.target === 'string' && request.target in MAP_NODES, 'INVALID_TARGET');
    const target = request.target as NodeId;
    requireRule(MAP_NODES[target].landline === true, 'INVALID_LANDLINE_ENDPOINT');
    return PLAYER_IDS.filter((id) => id !== senderID && G.players[id].location === target);
  }
  requireRule(PLAYER_IDS.includes(request.target as PlayerID), 'INVALID_TARGET');
  requireRule(request.target !== senderID, 'INVALID_TARGET');
  return [request.target as PlayerID];
}

function truncate(text: string, cap: number | null): { text: string; truncated: boolean } {
  if (cap === null) return { text, truncated: false };
  const characters = Array.from(text);
  return characters.length <= cap
    ? { text, truncated: false }
    : { text: characters.slice(0, cap).join(''), truncated: true };
}

/**
 * Resolves a Contact send. Remote callers intentionally receive no delivery detail;
 * the full result is retained only in messageOutcomes and recipient inboxes.
 */
export function deliver(
  G: TruthState,
  senderID: PlayerID,
  request: SendRequest,
  randomNumber: () => number,
): SenderSendResult {
  requireRule(PLAYER_IDS.includes(senderID), 'INVALID_PLAYER');
  const sender = G.players[senderID];
  requireRule(sender.alive, 'PLAYER_DEAD');
  requireRule(!sender.ready, 'READY_LOCKED');
  requireRule(request.method in METHOD_SPECS, 'UNKNOWN_METHOD');
  requireRule(typeof request.text === 'string' && request.text.length > 0, 'INVALID_MESSAGE');
  requireRule(request.method === 'FACE_TO_FACE' || sender.methods.includes(request.method), 'METHOD_NOT_HELD');
  requireRule(request.method !== 'BULLETIN', 'USE_BULLETIN_BOARD');
  requireRule(senderConnected(G, senderID, request.method), 'METHOD_UNAVAILABLE');

  // Costs precede audience resolution. A valid empty landline call therefore burns its dial.
  chargeSend(G, senderID, request.method);
  const candidates = audienceFor(G, senderID, request);
  const excluded: MessageOutcome['excluded'] = [];
  const eligible = candidates.filter((recipientID) => {
    const recipient = G.players[recipientID];
    if (!recipient.alive) {
      excluded.push({ player: recipientID, reason: 'DEAD' });
      return false;
    }
    if (request.method !== 'FACE_TO_FACE' && !recipient.methods.includes(request.method)) {
      excluded.push({ player: recipientID, reason: 'METHOD_NOT_HELD' });
      return false;
    }
    if (!recipientConnected(G, senderID, recipientID, request.method)) {
      excluded.push({ player: recipientID, reason: 'NOT_CONNECTED' });
      return false;
    }
    return true;
  });
  const delivered = truncate(request.text, METHOD_SPECS[request.method].payloadCap);
  const recipients: PlayerID[] = [];
  const dropped: PlayerID[] = [];
  const dropRate = methodAvailability(G, request.method).dropRate;
  for (const recipientID of eligible) {
    if (dropRate > 0 && randomNumber() < dropRate) {
      dropped.push(recipientID);
      continue;
    }
    recipients.push(recipientID);
    G.players[recipientID].inbox.push({
      day: G.day,
      from: senderID,
      method: request.method,
      text: delivered.text,
    });
  }
  const outcome: MessageOutcome = {
    day: G.day,
    sender: senderID,
    method: request.method,
    target: request.target,
    rawText: request.text,
    deliveredText: delivered.text,
    recipients,
    dropped,
    excluded,
    truncated: delivered.truncated,
  };
  (G.messageOutcomes ??= []).push(outcome);

  if (request.method === 'FACE_TO_FACE') return { state: 'delivered', recipients: [...recipients] };
  sender.lastSend = { day: G.day, state: 'sent' };
  return { state: 'sent' };
}

export const sendMessage: MoveFn<TruthState> = ({ G, playerID, random, log }, request: SendRequest) => {
  deliver(G, playerID as PlayerID, request, () => random.Number());
  log.setMetadata({ paceMessage: structuredClone(G.messageOutcomes!.at(-1)!) });
};

export interface SenderMethodStatus {
  available: boolean;
  reason?: string;
}

/** Private owner-only status used by playerView; never includes recipient eligibility. */
export function senderMethodStatus(G: TruthState, playerID: PlayerID, method: MethodId): SenderMethodStatus {
  const player = G.players[playerID];
  if (!player.alive) return { available: false, reason: 'You can no longer communicate.' };
  if (!player.methods.includes(method)) return { available: false, reason: 'Method not selected.' };
  if (method === 'BULLETIN') {
    return MAP_NODES[player.location].bulletin
      ? { available: true }
      : { available: false, reason: 'No bulletin board at your location.' };
  }
  if (!senderConnected(G, playerID, method)) return { available: false, reason: 'Not connected here today.' };
  const usage = player.commsUsage?.day === G.day ? player.commsUsage : undefined;
  if (method === 'LANDLINE' && usage?.landlineDialed) {
    return { available: false, reason: 'Daily dial already used.' };
  }
  let cost = 0;
  const multiplier = G.day === 5 ? BALANCE.communicationPrice.DAY_5_MULTIPLIER : 1;
  if (INFRASTRUCTURE_METHODS.includes(method as (typeof INFRASTRUCTURE_METHODS)[number])) {
    const infra = method as (typeof INFRASTRUCTURE_METHODS)[number];
    cost = usage?.infrastructureCharged[infra]
      ? 0
      : BALANCE.communicationPrice.INFRASTRUCTURE_FIRST_USE * multiplier;
  } else if (method === 'MESH' || method === 'WALKIE') {
    const quota = METHOD_SPECS[method].batteryPerSends!;
    const sends = usage?.sends[method] ?? 0;
    cost = sends % quota === 0 ? multiplier : 0;
  }
  return player.inventory.battery >= cost
    ? { available: true }
    : { available: false, reason: `Needs ${cost} Battery.` };
}

function validItems(items: Inventory): boolean {
  return Number.isInteger(items.food) && items.food >= 0
    && Number.isInteger(items.battery) && items.battery >= 0;
}

/** Immediate, free, atomic Contact gift between two living co-located players. */
export function exchangeItems(
  G: TruthState,
  senderID: PlayerID,
  recipientID: PlayerID,
  items: Inventory,
): void {
  requireRule(PLAYER_IDS.includes(senderID) && PLAYER_IDS.includes(recipientID), 'INVALID_PLAYER');
  requireRule(senderID !== recipientID, 'INVALID_TARGET');
  const sender = G.players[senderID];
  const recipient = G.players[recipientID];
  requireRule(sender.alive && recipient.alive, 'PLAYER_DEAD');
  requireRule(!sender.ready, 'READY_LOCKED');
  requireRule(sender.location === recipient.location, 'NOT_COLOCATED');
  requireRule(validItems(items), 'INVALID_QUANTITY');
  requireRule(items.food + items.battery > 0, 'ZERO_QUANTITY');
  requireRule(sender.inventory.food >= items.food && sender.inventory.battery >= items.battery, 'INSUFFICIENT_ITEMS');
  requireRule(
    recipient.inventory.food + recipient.inventory.battery + items.food + items.battery <= recipient.capacity,
    'HANDS_FULL',
  );
  sender.inventory.food -= items.food;
  sender.inventory.battery -= items.battery;
  recipient.inventory.food += items.food;
  recipient.inventory.battery += items.battery;
}

export const exchange: MoveFn<TruthState> = ({ G, playerID }, recipientID: PlayerID, items: Inventory) =>
  exchangeItems(G, playerID as PlayerID, recipientID, items);
