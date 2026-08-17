import type { LogEntry, Server as ServerTypes, State, StorageAPI } from 'boardgame.io';
import type { MessageOutcome } from '../types';

interface PaceLogMetadata {
  paceMessage?: MessageOutcome;
  paceMessages?: MessageOutcome[];
}

class MetadataConflictError extends Error {
  readonly status = 409;
  readonly expose = true;
}

function normaliseLobbyName(name: string): string {
  return name.trim().toLowerCase();
}

function assertMetadataUpdateIsCurrent(
  current: ServerTypes.MatchData | undefined,
  next: ServerTypes.MatchData,
): void {
  const claimedNames = Object.values(next.players)
    .map((player) => player.name && normaliseLobbyName(player.name))
    .filter((name): name is string => Boolean(name));
  if (new Set(claimedNames).size !== claimedNames.length) {
    throw new MetadataConflictError('That name is already in this game.');
  }

  if (!current) return;
  for (const [playerID, currentSeat] of Object.entries(current.players)) {
    const nextSeat = next.players[Number(playerID)];
    if (
      currentSeat.credentials
      && nextSeat?.credentials
      && currentSeat.credentials !== nextSeat.credentials
    ) {
      throw new MetadataConflictError('That seat was claimed at the same time.');
    }
  }
}

/** In-memory boardgame.io storage with private authoritative message stdout events. */
export class LoggingInMemory implements StorageAPI.Sync {
  private readonly states = new Map<string, State>();
  private readonly initial = new Map<string, State>();
  private readonly metadata = new Map<string, ServerTypes.MatchData>();
  private readonly logs = new Map<string, LogEntry[]>();

  type() { return 0 as const; }
  connect() { return; }

  createMatch(matchID: string, opts: StorageAPI.CreateMatchOpts) {
    this.initial.set(matchID, opts.initialState);
    this.setState(matchID, opts.initialState);
    this.setMetadata(matchID, opts.metadata);
  }

  setState(matchID: string, state: State, deltalog?: LogEntry[]) {
    if (deltalog?.length) {
      this.logs.set(matchID, [...(this.logs.get(matchID) ?? []), ...deltalog]);
      for (const entry of deltalog) {
        const metadata = entry.metadata as PaceLogMetadata | undefined;
        const outcomes = metadata?.paceMessages
          ?? (metadata?.paceMessage ? [metadata.paceMessage] : []);
        for (const outcome of outcomes) {
          console.log(JSON.stringify({
            event: 'pace.message.v1',
            match: matchID,
            serverTime: new Date().toISOString(),
            gameDay: outcome.day,
            phase: entry.phase,
            sender: outcome.sender,
            method: outcome.method,
            target: outcome.target,
            rawText: outcome.rawText,
            deliveredText: outcome.deliveredText,
            recipients: outcome.recipients,
            dropped: outcome.dropped,
            excluded: outcome.excluded,
            truncated: outcome.truncated,
          }));
        }
      }
    }
    this.states.set(matchID, state);
  }

  setMetadata(matchID: string, metadata: ServerTypes.MatchData) {
    assertMetadataUpdateIsCurrent(this.metadata.get(matchID), metadata);
    this.metadata.set(matchID, structuredClone(metadata));
  }

  fetch<O extends StorageAPI.FetchOpts>(matchID: string, opts: O): StorageAPI.FetchResult<O> {
    const result: Partial<StorageAPI.FetchFields> = {};
    if (opts.state) result.state = this.states.get(matchID)!;
    if (opts.metadata) {
      const metadata = this.metadata.get(matchID);
      if (metadata) result.metadata = structuredClone(metadata);
    }
    if (opts.log) result.log = this.logs.get(matchID) ?? [];
    if (opts.initialState) result.initialState = this.initial.get(matchID)!;
    return result as StorageAPI.FetchResult<O>;
  }

  wipe(matchID: string) {
    this.states.delete(matchID);
    this.initial.delete(matchID);
    this.metadata.delete(matchID);
    this.logs.delete(matchID);
  }

  listMatches(opts?: StorageAPI.ListMatchesOpts): string[] {
    return [...this.metadata.entries()].filter(([, metadata]) => {
      if (opts?.gameName !== undefined && metadata.gameName !== opts.gameName) return false;
      if (opts?.where?.isGameover !== undefined && (metadata.gameover !== undefined) !== opts.where.isGameover) return false;
      if (opts?.where?.updatedBefore !== undefined && metadata.updatedAt >= opts.where.updatedBefore) return false;
      if (opts?.where?.updatedAfter !== undefined && metadata.updatedAt <= opts.where.updatedAfter) return false;
      return true;
    }).map(([matchID]) => matchID);
  }
}
