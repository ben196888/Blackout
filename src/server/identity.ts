import type { Server as ServerTypes, StorageAPI } from 'boardgame.io';

export type SeatCredentialStatus = 'VALID' | 'INVALID' | 'NOT_FOUND';

interface SeatCredentialRequest {
  auth: {
    authenticateCredentials(args: {
      playerID: string;
      credentials: string | undefined;
      metadata: ServerTypes.MatchData;
    }): boolean | Promise<boolean>;
  };
  credentials: string | undefined;
  db: StorageAPI.Sync | StorageAPI.Async;
  gameName: string;
  matchID: string;
  playerID: string;
}

/** Authenticate a claimed seat without mutating lobby metadata. */
export async function validateSeatCredentials({
  auth,
  credentials,
  db,
  gameName,
  matchID,
  playerID,
}: SeatCredentialRequest): Promise<SeatCredentialStatus> {
  const { metadata } = await (db as StorageAPI.Async).fetch(matchID, { metadata: true });
  if (!metadata || metadata.gameName !== gameName) return 'NOT_FOUND';

  const seatNumber = Number(playerID);
  if (!Number.isInteger(seatNumber) || String(seatNumber) !== playerID) return 'INVALID';
  const seat = metadata.players[seatNumber] as ServerTypes.PlayerMetadata | undefined;
  if (!seat?.name || !seat.credentials || !credentials) return 'INVALID';

  const valid = await auth.authenticateCredentials({ playerID, credentials, metadata });
  return valid ? 'VALID' : 'INVALID';
}
