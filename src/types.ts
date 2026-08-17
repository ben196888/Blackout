import type { CHARACTER_IDS, METHOD_IDS, STARTING_NODES } from './constants';

export type PlayerID = '0' | '1' | '2' | '3';
export type CharacterId = (typeof CHARACTER_IDS)[number];
export type MethodId = (typeof METHOD_IDS)[number];
export type NodeId =
  | (typeof STARTING_NODES)[number]
  | 'TEMPLE'
  | 'STORE'
  | 'CLINIC'
  | 'FIELD'
  | 'TEA'
  | 'POND'
  | 'SHRINE'
  | 'QUARRY'
  | 'BRIDGE_N'
  | 'BRIDGE_S'
  | 'MTNRD'
  | 'FORD';

export interface Inventory {
  food: number;
  battery: number;
}

export interface CommsPlan {
  revision: number;
  fallbackRendezvous: 'SCHOOL';
  fallbackProtocol: string;
  reportingShorthand: string;
  notes: string;
  locked: boolean;
}

export interface PlayerTruth {
  character: CharacterId;
  methods: MethodId[];
  inventory: Inventory;
  capacity: number;
  location: NodeId;
  inbox: Array<{ day: number; from: PlayerID | 'SYSTEM'; method: string; text: string }>;
  knowledge: Knowledge;
  alive: boolean;
  starvationNights: number;
  actionsLeft: number;
  ready: boolean;
  radioListen: boolean;
}

export interface Memory<T> {
  value: T;
  asOfDay: number;
  source: 'setup' | 'co-location' | 'sightline' | 'high-ground' | 'arrival' | 'body';
}

export interface Knowledge {
  positions: Partial<Record<PlayerID, Memory<NodeId>>>;
  caches: Partial<Record<NodeId, Memory<Inventory>>>;
  bodies: Partial<Record<PlayerID, Memory<NodeId>>>;
}

export interface ClearRoadProposal {
  edge: string;
  node: NodeId;
  contributors: PlayerID[];
}

export interface TruthState {
  day: number;
  rendezvous: NodeId;
  players: Record<PlayerID, PlayerTruth>;
  caches: Record<NodeId, Inventory>;
  severedEdges: string[];
  clearRoadProposals: Record<string, ClearRoadProposal>;
  commsPlan: CommsPlan;
}

export interface PublicPlayer {
  character: CharacterId;
  methods: MethodId[];
  hasFood: boolean;
  hasBattery: boolean;
  actionsLeft: number;
  ready: boolean;
}

export interface PlayerViewState {
  day: number;
  publicRendezvous: 'SCHOOL';
  publicPlayers: Record<PlayerID, PublicPlayer>;
  commsPlan: CommsPlan;
  severedEdges: string[];
  startingLocations: Record<PlayerID, NodeId>;
  localCache: Inventory | null;
  you: PlayerTruth | null;
}

export interface CommsPlanInput {
  expectedRevision: number;
  fallbackProtocol: string;
  reportingShorthand: string;
  notes: string;
}
