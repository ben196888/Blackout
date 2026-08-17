import type { PlayerID } from '../types';

export interface SeatIdentity {
  playerID: PlayerID;
  credentials: string;
  name: string;
}

export interface Identity {
  get(matchID: string): SeatIdentity | null;
  set(matchID: string, seat: SeatIdentity): void;
  clear(matchID: string): void;
}

const key = (matchID: string) => `pace.identity.${matchID}`;

function isSeatIdentity(value: unknown): value is SeatIdentity {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    ['0', '1', '2', '3'].includes(String(record.playerID)) &&
    typeof record.credentials === 'string' &&
    record.credentials.length > 0 &&
    typeof record.name === 'string' &&
    record.name.length > 0
  );
}

export const localIdentity: Identity = {
  get(matchID) {
    try {
      const raw = localStorage.getItem(key(matchID));
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!isSeatIdentity(parsed)) {
        localStorage.removeItem(key(matchID));
        return null;
      }
      return parsed;
    } catch {
      localStorage.removeItem(key(matchID));
      return null;
    }
  },
  set(matchID, seat) {
    localStorage.setItem(key(matchID), JSON.stringify(seat));
  },
  clear(matchID) {
    localStorage.removeItem(key(matchID));
  },
};
