import type { RandomAPI } from 'boardgame.io/dist/types/src/plugins/random/random';
import {
  ACTIONS_PER_DAY,
  CHARACTER_IDS,
  DEFAULT_RENDEZVOUS,
  STARTING_NODES,
} from '../constants';
import type { CharacterId, Inventory, PlayerID, PlayerTruth, TruthState } from '../types';

const PLAYER_IDS: PlayerID[] = ['0', '1', '2', '3'];

export function startingInventory(character: CharacterId): Inventory {
  if (character === 'STORE_OWNER') return { food: 6, battery: 4 };
  return { food: 3, battery: 3 };
}

export function capacityFor(character: CharacterId): number {
  return character === 'OFFICE_WORKER' ? 12 : 10;
}

export function assignCharacters(random: Pick<RandomAPI, 'Shuffle'>): CharacterId[] {
  const candidates = CHARACTER_IDS.filter((id) => id !== 'VILLAGE_LEADER');
  const selected = ['VILLAGE_LEADER', ...random.Shuffle(candidates).slice(0, 3)] as CharacterId[];
  return random.Shuffle(selected);
}

export function createInitialState(random: Pick<RandomAPI, 'Shuffle'>): TruthState {
  const characters = assignCharacters(random);
  const players = Object.fromEntries(
    PLAYER_IDS.map((playerID, index) => {
      const character = characters[index];
      const location = STARTING_NODES[index];
      if (!character || !location) throw new Error('Invalid four-seat setup');
      const inventory = startingInventory(character);
      const capacity = capacityFor(character);
      if (inventory.food + inventory.battery > capacity) {
        throw new Error(`Starting inventory exceeds capacity for ${character}`);
      }
      const player: PlayerTruth = {
        character,
        methods: [],
        inventory,
        capacity,
        location,
        inbox: [],
        knowledge: {},
        alive: true,
        starvationNights: 0,
        actionsLeft: ACTIONS_PER_DAY,
        ready: false,
        radioListen: false,
      };
      return [playerID, player];
    }),
  ) as Record<PlayerID, PlayerTruth>;

  return {
    day: 0,
    rendezvous: DEFAULT_RENDEZVOUS,
    players,
    commsPlan: {
      revision: 0,
      fallbackRendezvous: DEFAULT_RENDEZVOUS,
      fallbackProtocol: '',
      reportingShorthand: '',
      notes: '',
      locked: false,
    },
  };
}
