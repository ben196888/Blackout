import type { MoveFn } from 'boardgame.io';
import { ACTIONS_PER_DAY, BALANCE } from '../constants';
import type { Inventory, NodeId, PlayerID, TruthState } from '../types';
import { requireRule } from './errors';
import { readCurrentBulletin } from './facilities';
import { MAP_EDGES, MAP_NODES, edgeKey, getEdge, validatePath } from './map';

const PLAYER_IDS: PlayerID[] = ['0', '1', '2', '3'];

function playerFor(G: TruthState, playerID: string) {
  requireRule(PLAYER_IDS.includes(playerID as PlayerID), 'INVALID_PLAYER');
  const player = G.players[playerID as PlayerID];
  requireRule(player.alive, 'PLAYER_DEAD');
  requireRule(!player.ready, 'READY_LOCKED');
  return player;
}

function nonNegativeIntegers(items: Inventory) {
  return Number.isInteger(items.food) && items.food >= 0 && Number.isInteger(items.battery) && items.battery >= 0;
}

export function cancelRoadProposalsFor(G: TruthState, playerID: PlayerID) {
  for (const [key, proposal] of Object.entries(G.clearRoadProposals)) {
    if (!proposal.contributors.includes(playerID)) continue;
    for (const contributor of proposal.contributors) {
      const player = G.players[contributor];
      player.actionsLeft = Math.min(ACTIONS_PER_DAY, player.actionsLeft + 1);
    }
    delete G.clearRoadProposals[key];
  }
}

export function cancelAllRoadProposals(G: TruthState) {
  for (const proposal of Object.values(G.clearRoadProposals)) {
    for (const contributor of proposal.contributors) {
      const player = G.players[contributor];
      player.actionsLeft = Math.min(ACTIONS_PER_DAY, player.actionsLeft + 1);
    }
  }
  G.clearRoadProposals = {};
}

function rememberArrival(G: TruthState, playerID: PlayerID, nodes: readonly NodeId[]) {
  const observer = G.players[playerID];
  for (const node of nodes) {
    observer.knowledge.caches[node] = {
      value: { ...G.caches[node] },
      asOfDay: G.day,
      source: 'arrival',
    };
    for (const targetID of PLAYER_IDS) {
      const target = G.players[targetID];
      if (!target.alive && target.location === node) {
        observer.knowledge.bodies[targetID] = { value: node, asOfDay: G.day, source: 'body' };
      }
    }
  }
}

export function refreshPositionKnowledge(G: TruthState) {
  const living = PLAYER_IDS.filter((id) => G.players[id].alive);
  for (const observerID of living) {
    const observer = G.players[observerID];
    for (const targetID of living) {
      if (observerID === targetID) continue;
      const target = G.players[targetID];
      if (observer.location === target.location) {
        observer.knowledge.positions[targetID] = {
          value: target.location,
          asOfDay: G.day,
          source: 'co-location',
        };
        continue;
      }
      if (observer.location === 'SHRINE' && MAP_NODES[target.location].open) {
        observer.knowledge.positions[targetID] = {
          value: target.location,
          asOfDay: G.day,
          source: 'high-ground',
        };
        continue;
      }
      if (MAP_NODES[target.location].open && getEdge(observer.location, target.location)) {
        observer.knowledge.positions[targetID] = {
          value: target.location,
          asOfDay: G.day,
          source: 'sightline',
        };
      }
    }
  }
}

export const movePlayer: MoveFn<TruthState> = ({ G, playerID }, path: NodeId[]) => {
  const player = playerFor(G, playerID);
  requireRule(Array.isArray(path), 'INVALID_PATH');
  requireRule(new Set(path).size === path.length, 'INVALID_PATH');
  const validated = validatePath(player.location, path, G.severedEdges);
  requireRule(validated, 'IMPASSABLE');
  const range = player.character === 'RESERVIST' ? 2 : 1;
  requireRule(validated.cost <= range, 'OUT_OF_RANGE');
  if (validated.cost > 0) requireRule(player.actionsLeft > 0, 'NO_ACTIONS');
  cancelRoadProposalsFor(G, playerID as PlayerID);
  if (validated.cost > 0) player.actionsLeft -= 1;
  for (const node of validated.entered) {
    player.location = node;
    rememberArrival(G, playerID as PlayerID, [node]);
    if (MAP_NODES[node].bulletin) readCurrentBulletin(G, playerID as PlayerID);
    refreshPositionKnowledge(G);
  }
};

export const scavenge: MoveFn<TruthState> = ({ G, playerID }, request: Inventory) => {
  const player = playerFor(G, playerID);
  requireRule(nonNegativeIntegers(request), 'INVALID_QUANTITY');
  const total = request.food + request.battery;
  requireRule(total > 0, 'ZERO_QUANTITY');
  const yieldLimit = player.character === 'OFFICE_WORKER'
    ? BALANCE.scavengeYield.OFFICE_WORKER
    : BALANCE.scavengeYield.DEFAULT;
  requireRule(total <= yieldLimit, 'OVER_YIELD');
  requireRule(player.actionsLeft > 0, 'NO_ACTIONS');
  const room = player.capacity - player.inventory.food - player.inventory.battery;
  requireRule(room > 0, 'HANDS_FULL');
  const cache = G.caches[player.location];
  const food = Math.min(request.food, cache.food, room);
  const battery = Math.min(request.battery, cache.battery, room - food);
  requireRule(food + battery > 0, 'CACHE_EMPTY');
  cache.food -= food;
  cache.battery -= battery;
  player.inventory.food += food;
  player.inventory.battery += battery;
  player.actionsLeft -= 1;
  player.knowledge.caches[player.location] = {
    value: { ...cache },
    asOfDay: G.day,
    source: 'arrival',
  };
};

export const dropItems: MoveFn<TruthState> = ({ G, playerID }, items: Inventory) => {
  const player = playerFor(G, playerID);
  requireRule(player.character === 'STORE_OWNER', 'ABILITY_REQUIRED');
  requireRule(nonNegativeIntegers(items), 'INVALID_QUANTITY');
  requireRule(items.food + items.battery > 0, 'ZERO_QUANTITY');
  requireRule(player.actionsLeft > 0, 'NO_ACTIONS');
  requireRule(player.inventory.food >= items.food && player.inventory.battery >= items.battery, 'INSUFFICIENT_ITEMS');
  player.inventory.food -= items.food;
  player.inventory.battery -= items.battery;
  G.caches[player.location].food += items.food;
  G.caches[player.location].battery += items.battery;
  player.actionsLeft -= 1;
  player.knowledge.caches[player.location] = {
    value: { ...G.caches[player.location] },
    asOfDay: G.day,
    source: 'arrival',
  };
};

export const clearRoad: MoveFn<TruthState> = ({ G, playerID }, requestedEdge: string) => {
  const player = playerFor(G, playerID);
  requireRule(player.actionsLeft > 0, 'NO_ACTIONS');
  requireRule(G.severedEdges.includes(requestedEdge), 'ROAD_NOT_SEVERED');
  const edge = MAP_EDGES.find((candidate) => edgeKey(candidate.a, candidate.b) === requestedEdge);
  requireRule(edge, 'UNKNOWN_EDGE');
  requireRule(player.location === edge.a || player.location === edge.b, 'NOT_AT_ENDPOINT');
  const existing = G.clearRoadProposals[requestedEdge];
  if (!existing) {
    player.actionsLeft -= 1;
    G.clearRoadProposals[requestedEdge] = {
      edge: requestedEdge,
      node: player.location,
      contributors: [playerID as PlayerID],
    };
    return;
  }
  requireRule(existing.node === player.location, 'NOT_COLOCATED');
  requireRule(!existing.contributors.includes(playerID as PlayerID), 'ALREADY_CONTRIBUTED');
  const first = G.players[existing.contributors[0]!];
  requireRule(first.alive && first.location === player.location && !first.ready, 'PROPOSAL_CANCELLED');
  player.actionsLeft -= 1;
  G.severedEdges = G.severedEdges.filter((key) => key !== requestedEdge);
  delete G.clearRoadProposals[requestedEdge];
};

export const finishMove: MoveFn<TruthState> = ({ G, playerID }, confirmUnused = false) => {
  const player = playerFor(G, playerID);
  requireRule(player.actionsLeft === 0 || confirmUnused === true, 'CONFIRM_UNUSED_ACTIONS');
  cancelRoadProposalsFor(G, playerID as PlayerID);
  player.ready = true;
  player.actionsLeft = 0;
};

export function resolveNightEconomy(G: TruthState) {
  const livingAtStart = PLAYER_IDS.filter((id) => G.players[id].alive);
  const newlyDead: PlayerID[] = [];
  for (const playerID of livingAtStart) {
    const player = G.players[playerID];
    const sharesNode = livingAtStart.some((otherID) =>
      otherID !== playerID && G.players[otherID].location === player.location);
    const exposure = [2, 3, 5].includes(G.day) && MAP_NODES[player.location].open ? 1 : 0;
    const nurseDiscount = player.character === 'NURSE' && sharesNode ? 1 : 0;
    const consumption = Math.max(0, 1 + exposure - nurseDiscount);
    player.inventory.food = Math.max(0, player.inventory.food - consumption);
    if (player.inventory.food === 0) player.starvationNights += 1;
    else player.starvationNights = 0;
    if (player.starvationNights >= 2) {
      player.alive = false;
      newlyDead.push(playerID);
      cancelRoadProposalsFor(G, playerID);
    }
  }
  for (const deadID of newlyDead) {
    const dead = G.players[deadID];
    for (const observerID of PLAYER_IDS) {
      const observer = G.players[observerID];
      if (observer.alive && observer.location === dead.location) {
        observer.knowledge.bodies[deadID] = {
          value: dead.location,
          asOfDay: G.day,
          source: 'body',
        };
      }
    }
  }
}
