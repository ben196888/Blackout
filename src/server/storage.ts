import type { LogEntry, Server as ServerTypes, State, StorageAPI } from 'boardgame.io';
import type { MessageOutcome } from '../types';

interface PaceLogMetadata {
  paceMessage?: MessageOutcome;
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
        const outcome = (entry.metadata as PaceLogMetadata | undefined)?.paceMessage;
        if (!outcome) continue;
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
    this.states.set(matchID, state);
  }

  setMetadata(matchID: string, metadata: ServerTypes.MatchData) {
    this.metadata.set(matchID, metadata);
  }

  fetch<O extends StorageAPI.FetchOpts>(matchID: string, opts: O): StorageAPI.FetchResult<O> {
    const result: Partial<StorageAPI.FetchFields> = {};
    if (opts.state) result.state = this.states.get(matchID)!;
    if (opts.metadata) result.metadata = this.metadata.get(matchID)!;
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
