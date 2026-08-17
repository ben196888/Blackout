export const GAME_NAME = 'blackout';
export const PLAYER_COUNT = 4;
export const ACTIONS_PER_DAY = 2;
export const DEFAULT_RENDEZVOUS = 'SCHOOL' as const;

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
