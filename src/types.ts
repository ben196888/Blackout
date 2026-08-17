import type { CHARACTER_IDS, METHOD_IDS, STARTING_NODES } from './constants';

export type PlayerID = '0' | '1' | '2' | '3';
export type CharacterId = (typeof CHARACTER_IDS)[number];
export type MethodId = (typeof METHOD_IDS)[number];
export type DeliveryMethodId = MethodId | 'FACE_TO_FACE';
export type FacilityMethodId = 'RADIO' | 'VILLAGE_BROADCAST';
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
  /** Durable private copies of bulletin posts this player has read. */
  bulletinNotebook?: BulletinPost[];
  /** Private knowledge of the true rendezvous, if learned in play. */
  rendezvousKnowledge?: RendezvousKnowledge;
  /** Lazily reset by the comms engine when the game day changes. */
  commsUsage?: DailyCommsUsage;
  /** The only remote-send outcome exposed back to the sender. */
  lastSend?: { day: number; state: 'sent' };
}

export interface DailyCommsUsage {
  day: number;
  sends: Partial<Record<MethodId, number>>;
  infrastructureCharged: Partial<Record<'MOBILE_DATA' | 'MOBILE_VOICE' | 'SMS', true>>;
  landlineDialed: boolean;
}

export interface MessageOutcome {
  day: number;
  sender: PlayerID;
  method: DeliveryMethodId | FacilityMethodId;
  target: PlayerID | NodeId | null;
  rawText: string;
  deliveredText: string;
  recipients: PlayerID[];
  dropped: PlayerID[];
  excluded: Array<{
    player: PlayerID;
    reason: 'DEAD' | 'METHOD_NOT_HELD' | 'NOT_CONNECTED';
  }>;
  truncated: boolean;
}

export type BulletinBoardId = (typeof STARTING_NODES)[number];

export interface BulletinPost {
  id: string;
  board: BulletinBoardId;
  day: number;
  author: PlayerID | 'SYSTEM';
  text: string;
  official: boolean;
}

export interface RendezvousKnowledge {
  location: NodeId;
  learnedDay: number;
  source: 'RADIO' | 'BULLETIN';
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
  /** Server-authoritative delivery facts. Never included in PlayerViewState. */
  messageOutcomes?: MessageOutcome[];
  /** Append-only boards at VO, SCHOOL, COOP and FOREST. */
  bulletinBoards?: Record<BulletinBoardId, BulletinPost[]>;
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
  methodConnectivity: Partial<Record<MethodId, { available: boolean; reason?: string }>>;
  you: PlayerTruth | null;
}

export interface CommsPlanInput {
  expectedRevision: number;
  fallbackProtocol: string;
  reportingShorthand: string;
  notes: string;
}
