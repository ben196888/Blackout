import type { Server as ServerTypes } from 'boardgame.io';
import { describe, expect, it, vi } from 'vitest';
import { validateSeatCredentials } from '../src/server/identity';
import { LoggingInMemory } from '../src/server/storage';

function metadata(overrides: Partial<ServerTypes.PlayerMetadata> = {}): ServerTypes.MatchData {
  return {
    gameName: 'blackout',
    players: {
      0: { id: 0, name: 'Player 1', credentials: 'correct-token', ...overrides },
      1: { id: 1 },
      2: { id: 2 },
      3: { id: 3 },
    },
    createdAt: 1,
    updatedAt: 1,
  };
}

function setup(overrides?: Partial<ServerTypes.PlayerMetadata>) {
  const db = new LoggingInMemory();
  db.setMetadata('match-1', metadata(overrides));
  const authenticateCredentials = vi.fn(
    ({ credentials }: { credentials: string | undefined }) => credentials === 'correct-token',
  );
  return { db, auth: { authenticateCredentials } };
}

describe('seat credential validation', () => {
  it('delegates a claimed seat to boardgame.io authentication without mutation', async () => {
    const { db, auth } = setup();
    const before = structuredClone(db.fetch('match-1', { metadata: true }).metadata);

    await expect(validateSeatCredentials({
      auth, credentials: 'correct-token', db, gameName: 'blackout', matchID: 'match-1', playerID: '0',
    })).resolves.toBe('VALID');

    expect(auth.authenticateCredentials).toHaveBeenCalledOnce();
    expect(db.fetch('match-1', { metadata: true }).metadata).toEqual(before);
  });

  it('rejects a wrong credential through boardgame.io authentication', async () => {
    const { db, auth } = setup();
    await expect(validateSeatCredentials({
      auth, credentials: 'wrong-token', db, gameName: 'blackout', matchID: 'match-1', playerID: '0',
    })).resolves.toBe('INVALID');
  });

  it.each([
    ['missing credential', undefined, '0', {}],
    ['unclaimed seat', 'correct-token', '1', {}],
    ['seat without stored credentials', 'correct-token', '0', { credentials: undefined }],
    ['invalid seat', 'correct-token', '9', {}],
    ['missing seat header', 'correct-token', '', {}],
    ['non-canonical seat header', 'correct-token', '01', {}],
  ])('rejects %s before authentication', async (_label, credentials, playerID, overrides) => {
    const { db, auth } = setup(overrides);
    await expect(validateSeatCredentials({
      auth, credentials, db, gameName: 'blackout', matchID: 'match-1', playerID,
    })).resolves.toBe('INVALID');
    expect(auth.authenticateCredentials).not.toHaveBeenCalled();
  });

  it('does not reveal a missing match or mismatched game', async () => {
    const { db, auth } = setup();
    await expect(validateSeatCredentials({
      auth, credentials: 'correct-token', db, gameName: 'other', matchID: 'match-1', playerID: '0',
    })).resolves.toBe('NOT_FOUND');
    await expect(validateSeatCredentials({
      auth, credentials: 'correct-token', db, gameName: 'blackout', matchID: 'missing', playerID: '0',
    })).resolves.toBe('NOT_FOUND');
  });
});
