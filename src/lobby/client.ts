import { LobbyClient, LobbyClientError } from 'boardgame.io/client';
import { GAME_NAME, PLAYER_COUNT } from '../constants';
import type { PlayerID } from '../types';
import type { SeatIdentity } from './identity';

export const lobbyClient = new LobbyClient({ server: '' });

export function normaliseName(raw: string): string {
  const name = raw.trim();
  const visibleLength = Array.from(name).length;
  if (visibleLength < 1 || visibleLength > 24) {
    throw new Error('Name must be 1–24 characters.');
  }
  return name;
}

export async function createAndClaim(rawName: string): Promise<{ matchID: string; seat: SeatIdentity }> {
  const name = normaliseName(rawName);
  const { matchID } = await lobbyClient.createMatch(GAME_NAME, { numPlayers: PLAYER_COUNT });
  const joined = await lobbyClient.joinMatch(GAME_NAME, matchID, {
    playerID: '0',
    playerName: name,
  });
  return {
    matchID,
    seat: {
      playerID: joined.playerID as PlayerID,
      credentials: joined.playerCredentials,
      name,
    },
  };
}

export async function claimFirstFree(matchID: string, rawName: string): Promise<SeatIdentity> {
  const name = normaliseName(rawName);
  const match = await lobbyClient.getMatch(GAME_NAME, matchID);
  const duplicate = match.players.some(
    (player) => player.name?.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
  );
  if (duplicate) throw new Error('That name is already in this game.');
  try {
    const joined = await lobbyClient.joinMatch(GAME_NAME, matchID, { playerName: name });
    return {
      playerID: joined.playerID as PlayerID,
      credentials: joined.playerCredentials,
      name,
    };
  } catch (error) {
    if (error instanceof LobbyClientError && error.details?.status === 409) {
      throw new Error('A seat was claimed at the same time. Check again and retry.');
    }
    throw error;
  }
}
