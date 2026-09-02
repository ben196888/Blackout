import type { MethodId } from '../types';

/** Column order for both matrices: durable methods first, infrastructure last. */
export const METHOD_ORDER: MethodId[] = [
  'WALKIE', 'MESH', 'BULLETIN', 'SMS', 'LANDLINE', 'MOBILE_VOICE', 'MOBILE_DATA',
];

/** One letter inside a matrix cell; the column header carries the full name. */
export const METHOD_LETTER: Record<MethodId, string> = {
  WALKIE: 'W', MESH: 'M', BULLETIN: 'B', SMS: 'S',
  LANDLINE: 'L', MOBILE_VOICE: 'V', MOBILE_DATA: 'D',
};

export const METHOD_COLUMN: Record<MethodId, string> = {
  WALKIE: 'WALKIE', MESH: 'MESH', BULLETIN: 'BULLET.', SMS: 'SMS',
  LANDLINE: 'LANDL.', MOBILE_VOICE: 'VOICE', MOBILE_DATA: 'DATA',
};

export const METHOD_SHORT: Record<MethodId | 'FACE_TO_FACE', string> = {
  WALKIE: 'WALKIE', MESH: 'MESH', BULLETIN: 'BULLETIN', SMS: 'SMS',
  LANDLINE: 'LANDLINE', MOBILE_VOICE: 'VOICE', MOBILE_DATA: 'DATA', FACE_TO_FACE: 'F2F',
};

/** The trade-off a seat is buying when it claims this method on Day 0. */
export const METHOD_TAG: Record<MethodId, string> = {
  WALKIE: '1 hop · 40ch',
  MESH: '1 hop + relay · 40ch',
  BULLETIN: 'free · async',
  SMS: '20ch · dies Day 3',
  LANDLINE: '4 phones · dies Day 3',
  MOBILE_VOICE: 'Day 1 only',
  MOBILE_DATA: 'Day 6 only',
};

/** Infrastructure methods are dark from Day 3 on, so their cells read as spent. */
export const DEAD_FROM_DAY_3: MethodId[] = ['SMS', 'LANDLINE', 'MOBILE_VOICE', 'MOBILE_DATA'];

export function isDeadOnDay(method: MethodId, day: number): boolean {
  if (method === 'MOBILE_DATA') return day !== 6;
  if (method === 'MOBILE_VOICE') return day >= 2;
  if (method === 'SMS' || method === 'LANDLINE') return day >= 3;
  return false;
}

export function seatLabel(id: string, playerID: string | null): string {
  return `${Number(id) + 1}${id === playerID ? ' (you)' : ''}`;
}
