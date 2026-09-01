import type { BoardProps } from 'boardgame.io/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CHARACTER_LABELS, METHOD_IDS, METHOD_LABELS, STARTING_NODES } from '../constants';
import { MAP_NODES } from '../game/map';
import type { CommsPlanInput, MethodId, NodeId, PlayerID, PlayerViewState } from '../types';
import { CharacterAbility } from './CharacterAbility';
import { GameBoard } from './GameBoard';
import { OutcomeBoard } from './OutcomeBoard';
import { METHOD_COLUMN, METHOD_LETTER, METHOD_ORDER, METHOD_TAG } from './methodDisplay';
import { VillageMap } from './VillageMap';

type PaceBoardProps = BoardProps<PlayerViewState>;

const SEAT_IDS: PlayerID[] = ['0', '1', '2', '3'];

/** Day 0 starting positions are fixed by seat, and everyone is told them. */
function startingNode(id: PlayerID): NodeId {
  return STARTING_NODES[Number(id)]!;
}

export function PlanningBoard({ G, ctx, moves, playerID, isConnected }: PaceBoardProps) {
  const you = G.you;
  const publicYou = playerID ? G.publicPlayers[playerID as PlayerID] : null;
  const [methods, setMethods] = useState<MethodId[]>(you?.methods ?? []);
  const [discussion, setDiscussion] = useState('');
  const [plan, setPlan] = useState<CommsPlanInput>({
    expectedRevision: G.commsPlan.revision,
    fallbackProtocol: G.commsPlan.fallbackProtocol,
    reportingShorthand: G.commsPlan.reportingShorthand,
    notes: G.commsPlan.notes,
  });
  const logRef = useRef<HTMLDivElement>(null);
  const methodLimit = you?.character === 'STUDENT' ? 5 : 4;
  const locked = Boolean(publicYou?.ready);

  useEffect(() => {
    setPlan({
      expectedRevision: G.commsPlan.revision,
      fallbackProtocol: G.commsPlan.fallbackProtocol,
      reportingShorthand: G.commsPlan.reportingShorthand,
      notes: G.commsPlan.notes,
    });
  }, [G.commsPlan.revision]);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [G.planningMessages.length]);

  const readyCount = useMemo(
    () => Object.values(G.publicPlayers).filter((player) => player.ready).length,
    [G.publicPlayers],
  );

  /** How many seats have claimed each method — a method needs two ends to work. */
  const coverage = useMemo(() => {
    const counts = {} as Record<MethodId, number>;
    for (const method of METHOD_IDS) {
      counts[method] = SEAT_IDS.filter((id) => G.publicPlayers[id]?.methods.includes(method)).length;
    }
    return counts;
  }, [G.publicPlayers]);

  const gaps = METHOD_ORDER.filter((method) => coverage[method] === 0);
  const saved = (publicYou?.methods.length ?? 0) === methodLimit;
  const selectionMatchesSaved = publicYou
    ? publicYou.methods.length === methods.length
      && methods.every((method) => publicYou.methods.includes(method))
    : false;

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
    <main className="match-shell">
      <header className="hud">
        <div className="hud-left">
          <span className="hud-day">DAY 0</span>
          <span className="hud-note">PLANNING · OPEN CHANNEL · NO COSTS YET</span>
        </div>
        <div className="hud-right">
          <span>FALLBACK RENDEZVOUS <strong style={{ color: 'var(--signal)' }}>{G.publicRendezvous}</strong></span>
          <span>READY <strong>{readyCount} / 4</strong></span>
          <a className="hud-link" href="/rules" rel="noreferrer" target="_blank">RULES</a>
          <span className={isConnected ? 'conn' : 'conn off'}>
            <span className={isConnected ? 'dot' : 'dot off'} />{isConnected ? 'CONNECTED' : 'RECONNECTING…'}
          </span>
        </div>
      </header>

      <div className="three-col">
        <div className="col col-left">
          <section className="card">
            <p className="card-title">Your role · seat {playerID ? Number(playerID) + 1 : '—'}</p>
            <p className="role-name">{you ? CHARACTER_LABELS[you.character] : 'Joining…'}</p>
            {you && <CharacterAbility character={you.character} />}
            {you && (
              <div className="stat-row">
                <span>Start <strong>{MAP_NODES[you.location].label.split(' ')[0]}</strong></span>
                <span>Food <strong>{you.inventory.food}</strong></span>
                <span>Battery <strong>{you.inventory.battery}</strong></span>
              </div>
            )}
          </section>

          <section className="card" style={{ flex: 1 }}>
            <div className="card-head">
              <p className="card-title">Claim your methods</p>
              <span className="hint good"><strong>{methods.length}</strong> / {methodLimit}</span>
            </div>
            <p className="hint">
              {locked
                ? 'Locked. These are what you hold for all seven nights.'
                : methods.length === methodLimit
                  ? 'Public. Save to publish the claim.'
                  : `Public. ${methodLimit - methods.length} more to pick.`}
            </p>
            <div className="method-claim" role="group" aria-label="Communication methods">
              {METHOD_ORDER.map((method) => {
                const claimed = methods.includes(method);
                const uncovered = coverage[method] === 0 && !claimed;
                return (
                  <button
                    aria-pressed={claimed}
                    disabled={locked}
                    key={method}
                    onClick={() => toggleMethod(method)}
                    type="button"
                  >
                    <span className="box">{claimed ? '✓' : ''}</span>
                    <span className="name">{METHOD_LABELS[method]}</span>
                    <span className={uncovered ? 'tag warn' : claimed ? 'tag good' : 'tag'}>
                      {uncovered ? 'nobody has it' : METHOD_TAG[method]}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              className="quiet"
              disabled={locked || methods.length !== methodLimit || selectionMatchesSaved}
              onClick={() => moves.chooseMethods!(methods)}
              style={{ marginTop: '.85rem', width: '100%' }}
            >
              {selectionMatchesSaved && saved ? 'Methods saved' : `Save ${methodLimit} methods`}
            </button>
          </section>

          <section className="card">
            <p className="card-title">Seats</p>
            <div className="seat-list">
              {SEAT_IDS.map((id) => {
                const seat = G.publicPlayers[id];
                if (!seat) return null;
                return (
                  <div data-testid={`planning-player-${id}`} key={id}>
                    <span>
                      {Number(id) + 1} · {CHARACTER_LABELS[seat.character]}
                      {id === playerID && <span className="muted"> (you)</span>}
                    </span>
                    <span className={seat.ready ? 'state-ready' : seat.methods.length ? 'state-acting' : 'state-idle'}>
                      {seat.ready ? 'READY' : seat.methods.length ? 'CLAIMED' : 'CHOOSING'}
                    </span>
                  </div>
                );
              })}
            </div>
            <button
              className="primary"
              disabled={locked || !saved}
              onClick={() => moves.ready!()}
              style={{ marginTop: '.9rem', width: '100%' }}
            >
              {locked
                ? 'READY LOCKED'
                : saved ? 'READY — LOCK MY CHOICES' : `PICK ${methodLimit - methods.length || methodLimit} MORE TO LOCK`}
            </button>
          </section>
        </div>

        <div className="col">
          <section className="map-frame">
            <header>
              <p className="card-title">Shared map · everyone sees this on Day 0</p>
              <span className="hint">Starting positions are public. After tonight they are not.</span>
            </header>
            <VillageMap
              ariaLabel="Village map"
              ghosts={SEAT_IDS.map((id) => ({
                label: `P${Number(id) + 1}${id === playerID ? ' YOU' : ''}`,
                node: startingNode(id),
              }))}
              height={430}
              labels="compact"
            />
            <div className="map-legend">
              <span className="sig">B bulletin board</span>
              <span className="sig">P landline phone</span>
              <span className="sig">H high ground</span>
              <span className="sig">━ free bridge crossing</span>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <p className="card-title">Coverage matrix</p>
              <span className={gaps.length ? 'hint warn' : 'hint good'}>
                {gaps.length
                  ? `${gaps.length} ${gaps.length === 1 ? 'gap' : 'gaps'} · a method only works if both ends hold it`
                  : 'every method has at least one holder'}
              </span>
            </div>
            <div className="matrix" style={{ gridTemplateColumns: '120px repeat(7, minmax(0, 1fr))' }}>
              <div />
              {METHOD_ORDER.map((method) => <div className="head" key={`h-${method}`}>{METHOD_COLUMN[method]}</div>)}
              {SEAT_IDS.map((id) => {
                const seat = G.publicPlayers[id];
                if (!seat) return null;
                return (
                  <div key={`row-${id}`} style={{ display: 'contents' }}>
                    <div className="rowname">{Number(id) + 1} {CHARACTER_LABELS[seat.character]}</div>
                    {METHOD_ORDER.map((method) => (
                      <div
                        className={seat.methods.includes(method) ? 'cell shared' : 'cell'}
                        key={`${id}-${method}`}
                        title={`Seat ${Number(id) + 1} · ${METHOD_LABELS[method]}`}
                      >{seat.methods.includes(method) ? METHOD_LETTER[method] : ''}</div>
                    ))}
                  </div>
                );
              })}
              <div className="rowname" style={{ color: 'var(--ink-dim)' }}>COVERED</div>
              {METHOD_ORDER.map((method) => (
                <div className={coverage[method] ? 'total' : 'total zero'} key={`t-${method}`}>{coverage[method]}</div>
              ))}
            </div>
            {gaps.length > 0 && (
              <div className="notice bad" style={{ marginTop: '.75rem' }}>
                <span>
                  Nobody holds {gaps.map((method) => METHOD_LABELS[method].toLowerCase()).join(', ')}.
                  A method only carries when the sender and the recipient both claimed it.
                </span>
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <p className="card-title">Shared comms plan · rev {G.commsPlan.revision}</p>
              <span className="hint">Anyone can edit until all four lock</span>
            </div>
            <div className="plan-grid">
              <label>
                Fallback protocol
                <textarea
                  disabled={locked}
                  onChange={(event) => setPlan({ ...plan, fallbackProtocol: event.target.value })}
                  placeholder="No word by night 2 → everyone walks to School and waits."
                  value={plan.fallbackProtocol}
                />
              </label>
              <label>
                Reporting shorthand
                <textarea
                  disabled={locked}
                  onChange={(event) => setPlan({ ...plan, reportingShorthand: event.target.value })}
                  placeholder="NODE / FOOD / BATT / NEXT. Example: FORD 2 3 TEA"
                  value={plan.reportingShorthand}
                />
              </label>
              <label>
                Notes
                <textarea
                  disabled={locked}
                  onChange={(event) => setPlan({ ...plan, notes: event.target.value })}
                  placeholder="Who listens to the radio, and on which nights."
                  value={plan.notes}
                />
              </label>
            </div>
            <button
              className="quiet"
              disabled={locked}
              onClick={() => moves.saveCommsPlan!(plan)}
              style={{ marginTop: '.75rem' }}
            >
              Save shared plan
            </button>
          </section>
        </div>

        <div className="col col-right">
          <div className="channel">
            <header>
              <span className="channel-title">OPEN CHANNEL</span>
              <span className="channel-count">LOGBOOK · {G.planningMessages.length} ENTRIES</span>
            </header>
            <div aria-label="Planning messages" className="channel-log" ref={logRef}>
              <p className="marker">— DAY 0 · CHANNEL OPEN —</p>
              {G.planningMessages.length === 0 && <p className="hint">No one has spoken yet.</p>}
              {G.planningMessages.map((message) => {
                const mine = message.author === playerID;
                const seat = G.publicPlayers[message.author];
                return (
                  <article className={mine ? 'entry you' : 'entry'} key={message.id}>
                    <div className="who">
                      <span>{seat ? CHARACTER_LABELS[seat.character].toUpperCase() : `SEAT ${Number(message.author) + 1}`}</span>
                      <span className="stamp">SEAT {Number(message.author) + 1}{mine ? ' · you' : ''}</span>
                    </div>
                    <p className="body">{message.text}</p>
                  </article>
                );
              })}
              {SEAT_IDS.filter((id) => G.publicPlayers[id]?.ready).map((id) => (
                <p className="marker" key={`locked-${id}`} style={{ fontStyle: 'italic' }}>
                  Seat {Number(id) + 1} locked their methods.
                </p>
              ))}
            </div>
            <div className="composer">
              <label style={{ gap: 0 }}>
                <span className="sr-only" hidden>Planning message</span>
                <div className="composer-box">
                  <textarea
                    aria-label="Planning message"
                    disabled={locked}
                    onChange={(event) => setDiscussion(event.target.value)}
                    placeholder="Say who covers what before anyone locks."
                    value={discussion}
                  />
                </div>
              </label>
              <div className="composer-meter">
                <span>No length limit today. Recorded to the logbook.</span>
              </div>
              <button
                className="primary"
                disabled={locked || !discussion.trim()}
                onClick={() => { moves.sendPlanningMessage!(discussion); setDiscussion(''); }}
              >
                SEND TO EVERYONE
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
