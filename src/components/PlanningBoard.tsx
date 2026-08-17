import type { BoardProps } from 'boardgame.io/react';
import { useEffect, useMemo, useState } from 'react';
import { CHARACTER_LABELS, METHOD_IDS, METHOD_LABELS } from '../constants';
import type { CommsPlanInput, MethodId, PlayerID, PlayerViewState } from '../types';
import { GameBoard } from './GameBoard';
import { OutcomeBoard } from './OutcomeBoard';

type PaceBoardProps = BoardProps<PlayerViewState>;

export function PlanningBoard({ G, ctx, moves, playerID, isConnected }: PaceBoardProps) {
  const you = G.you;
  const publicYou = playerID ? G.publicPlayers[playerID as PlayerID] : null;
  const [methods, setMethods] = useState<MethodId[]>(you?.methods ?? []);
  const [plan, setPlan] = useState<CommsPlanInput>({
    expectedRevision: G.commsPlan.revision,
    fallbackProtocol: G.commsPlan.fallbackProtocol,
    reportingShorthand: G.commsPlan.reportingShorthand,
    notes: G.commsPlan.notes,
  });
  const methodLimit = you?.character === 'STUDENT' ? 5 : 4;

  useEffect(() => {
    setPlan({
      expectedRevision: G.commsPlan.revision,
      fallbackProtocol: G.commsPlan.fallbackProtocol,
      reportingShorthand: G.commsPlan.reportingShorthand,
      notes: G.commsPlan.notes,
    });
  }, [G.commsPlan.revision]);

  const readyCount = useMemo(
    () => Object.values(G.publicPlayers).filter((player) => player.ready).length,
    [G.publicPlayers],
  );

  function toggleMethod(method: MethodId) {
    setMethods((current) => current.includes(method)
      ? current.filter((candidate) => candidate !== method)
      : current.length < methodLimit ? [...current, method] : current);
  }

  if (G.terminalOutcome) return <OutcomeBoard outcome={G.terminalOutcome} />;

  if (ctx.phase !== 'planning') {
    return <GameBoard G={G} ctx={ctx} moves={moves} playerID={playerID} isConnected={isConnected} />;
  }

  return (
    <main className="game-shell">
      <header className="statusbar">
        <strong>Day 0 · Planning</strong>
        <span>{readyCount}/4 ready</span>
        <span>{isConnected ? 'Connected' : 'Reconnecting…'}</span>
      </header>
      <div className="planning-grid">
        <section className="panel">
          <p className="eyebrow">Your role</p>
          <h2>{you ? CHARACTER_LABELS[you.character] : 'Joining…'}</h2>
          <p>Choose exactly {methodLimit} communication methods. Everyone can see the choice.</p>
          <div className="method-list">
            {METHOD_IDS.map((method) => (
              <label className="check" key={method}>
                <input
                  checked={methods.includes(method)}
                  disabled={Boolean(publicYou?.ready)}
                  onChange={() => toggleMethod(method)}
                  type="checkbox"
                />
                {METHOD_LABELS[method]}
              </label>
            ))}
          </div>
          <button
            disabled={Boolean(publicYou?.ready) || methods.length !== methodLimit}
            onClick={() => moves.chooseMethods!(methods)}
          >
            Save methods
          </button>
        </section>

        <section className="panel">
          <p className="eyebrow">Shared comms plan · revision {G.commsPlan.revision}</p>
          <h2>SCHOOL is the fallback rendezvous</h2>
          <label>Fallback protocol<textarea value={plan.fallbackProtocol} onChange={(event) => setPlan({ ...plan, fallbackProtocol: event.target.value })} /></label>
          <label>Reporting shorthand<textarea value={plan.reportingShorthand} onChange={(event) => setPlan({ ...plan, reportingShorthand: event.target.value })} /></label>
          <label>Notes<textarea value={plan.notes} onChange={(event) => setPlan({ ...plan, notes: event.target.value })} /></label>
          <button disabled={Boolean(publicYou?.ready)} onClick={() => moves.saveCommsPlan!(plan)}>Save shared plan</button>
        </section>

        <section className="panel roster">
          <p className="eyebrow">Public roster</p>
          {Object.entries(G.publicPlayers).map(([id, player]) => (
            <article key={id}>
              <strong>Seat {Number(id) + 1} · {CHARACTER_LABELS[player.character]}</strong>
              <span>{player.ready ? 'Ready' : 'Not ready'}</span>
              <small>{player.methods.length ? player.methods.map((method) => METHOD_LABELS[method]).join(', ') : 'Choosing methods'}</small>
              <small>{player.hasFood ? 'Food available' : 'Food unavailable'} · {player.hasBattery ? 'Battery available' : 'Battery unavailable'} · {player.actionsLeft} actions</small>
            </article>
          ))}
          <button
            className="primary"
            disabled={Boolean(publicYou?.ready) || publicYou?.methods.length !== methodLimit}
            onClick={() => moves.ready!()}
          >
            {publicYou?.ready ? 'Ready locked' : 'Ready — lock my choices'}
          </button>
        </section>
      </div>
    </main>
  );
}
