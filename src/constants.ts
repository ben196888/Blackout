export const GAME_NAME = 'blackout';
export const PLAYER_COUNT = 4;
export const ACTIONS_PER_DAY = 2;
export const DEFAULT_RENDEZVOUS = 'SCHOOL' as const;

/** The complete M7 tuning surface. Balance edits must stay in this object. */
export const BALANCE = {
  startingInventory: {
    DEFAULT: { food: 3, battery: 3 },
    OFFICE_WORKER: { food: 3, battery: 3 },
    STORE_OWNER: { food: 6, battery: 4 },
  },
  capacity: { DEFAULT: 10, OFFICE_WORKER: 12 },
  scavengeYield: { DEFAULT: 2, OFFICE_WORKER: 3 },
  mapSupply: {
    VO: { food: 0, battery: 2 },
    TEMPLE: { food: 3, battery: 0 },
    STORE: { food: 9, battery: 0 },
    SCHOOL: { food: 4, battery: 0 },
    CLINIC: { food: 2, battery: 2 },
    FIELD: { food: 0, battery: 0 },
    COOP: { food: 0, battery: 8 },
    TEA: { food: 3, battery: 0 },
    POND: { food: 1, battery: 0 },
    SHRINE: { food: 2, battery: 0 },
    QUARRY: { food: 0, battery: 0 },
    FOREST: { food: 0, battery: 0 },
    BRIDGE_N: { food: 0, battery: 0 },
    BRIDGE_S: { food: 0, battery: 0 },
    MTNRD: { food: 0, battery: 0 },
    FORD: { food: 0, battery: 0 },
  },
  payloadCap: { SMS: 20, MESH: 40, WALKIE: 40, VILLAGE_BROADCAST: 60 },
  dropRate: { MOBILE_VOICE_DAY_1: 0.5, SMS_DAY_2: 0.25 },
  communicationPrice: {
    INFRASTRUCTURE_FIRST_USE: 1,
    MESH_SENDS_PER_BATTERY: 2,
    WALKIE_SENDS_PER_BATTERY: 3,
    RADIO_NIGHTLY: 1,
    DAY_5_MULTIPLIER: 2,
  },
} as const;

export const METHOD_IDS = [
  'MOBILE_DATA',
  'MOBILE_VOICE',
  'SMS',
  'LANDLINE',
  'MESH',
  'WALKIE',
  'BULLETIN',
] as const;

export const CHARACTER_IDS = [
  'VILLAGE_LEADER',
  'STUDENT',
  'OFFICE_WORKER',
  'NURSE',
  'RESERVIST',
  'STORE_OWNER',
] as const;

export const STARTING_NODES = ['VO', 'SCHOOL', 'COOP', 'FOREST'] as const;

export const CHARACTER_LABELS: Record<(typeof CHARACTER_IDS)[number], string> = {
  VILLAGE_LEADER: 'Village Leader',
  STUDENT: 'Student',
  OFFICE_WORKER: 'Office Worker',
  NURSE: 'Nurse',
  RESERVIST: 'Reservist',
  STORE_OWNER: 'Store Owner',
};

export const METHOD_LABELS: Record<(typeof METHOD_IDS)[number], string> = {
  MOBILE_DATA: 'Mobile data',
  MOBILE_VOICE: 'Mobile voice',
  SMS: 'SMS',
  LANDLINE: 'Landline',
  MESH: 'Mesh',
  WALKIE: 'Walkie-talkie',
  BULLETIN: 'Bulletin board',
};
