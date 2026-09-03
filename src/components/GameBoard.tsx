import type { BoardProps } from 'boardgame.io/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BALANCE, CHARACTER_LABELS, METHOD_LABELS } from '../constants';
import { MAP_EDGES, MAP_NODES, NODE_IDS, distancesFrom, edgeKey, shortestPath } from '../game/map';
import type { Inventory, NodeId, PlayerID, PlayerViewState } from '../types';
import { CharacterAbility } from './CharacterAbility';
import { CommsPanel } from './CommsPanel';
import { DayStamp, dayAge } from './DayStamp';
import { FacilitiesPanel, RadioCard } from './FacilitiesPanel';
import { METHOD_COLUMN, METHOD_LETTER, METHOD_ORDER, isDeadOnDay } from './methodDisplay';
import { useToast } from './Toaster';
import { VillageMap, type CacheNote, type GhostMarker } from './VillageMap';

const SEAT_IDS: PlayerID[] = ['0', '1', '2', '3'];

export function clearableEdgesAt(location: NodeId, severedEdges: readonly string[]) {
  return MAP_EDGES.flatMap((edge) => {
    const key = edgeKey(edge.a, edge.b);
    if (!severedEdges.includes(key) || (edge.a !== location && edge.b !== location)) return [];
    return [{ key, label: `${MAP_NODES[edge.a].label} ↔ ${MAP_NODES[edge.b].label}` }];
  });
}

/** "F3 B2", "B8", or "EMPTY" — the shorthand the map draws under a node. */
export function cacheShorthand(inventory: Inventory): string {
  if (!inventory.food && !inventory.battery) return 'EMPTY';
  return [inventory.food ? `F${inventory.food}` : '', inventory.battery ? `B${inventory.battery}` : '']
    .filter(Boolean).join(' ');
}

interface ChannelEntry {
  key: string;
  who: string;
  stamp: string;
  meta: string;
  text: string;
  tone: 'you' | 'received' | '';
}


type GameBoardProps = Pick<BoardProps<PlayerViewState>, 'G' | 'ctx' | 'moves' | 'playerID' | 'isConnected'>;

export function GameBoard({ G, ctx, moves, playerID, isConnected }: GameBoardProps) {
  const you = G.you!;
  const publicYou = G.publicPlayers[playerID as PlayerID]!;
  const [take, setTake] = useState<Inventory>({ food: 0, battery: 0 });
  /** Mirrors `take` synchronously so two fast stepper clicks in one tick both land. */
  const takeRef = useRef<Inventory>(take);
  const [drop, setDrop] = useState<Inventory>({ food: 0, battery: 0 });
  const toast = useToast();
  const [note, setNote] = useState<{ title: string; body: string } | null>(null);
  const [error, setError] = useState<{ title: string; body: string } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const moving = ctx.phase === 'move' && you.alive && !publicYou.ready;
  const contacting = ctx.phase === 'contact' && you.alive && !publicYou.ready;
  const range = you.character === 'RESERVIST' ? 2 : 1;
  const yieldPerAction = you.character === 'OFFICE_WORKER'
    ? BALANCE.scavengeYield.OFFICE_WORKER
    : BALANCE.scavengeYield.DEFAULT;

  const reachable = useMemo(() => {
    const distance = distancesFrom(you.location, G.severedEdges);
    return NODE_IDS.filter((node) => node !== you.location && distance[node] <= range);
  }, [G.severedEdges, range, you.location]);

  const clearableEdges = useMemo(
    () => clearableEdgesAt(you.location, G.severedEdges),
    [G.severedEdges, you.location],
  );

  /** Everything you remember about where the others were, minus who is certainly here. */
  const withYou = useMemo(() => Object.entries(you.knowledge.positions)
    .filter(([, memory]) => memory && memory.asOfDay === G.day && memory.value === you.location)
    .map(([id]) => CHARACTER_LABELS[G.publicPlayers[id as PlayerID]!.character].toUpperCase()),
  [G.day, G.publicPlayers, you.knowledge.positions, you.location]);

  const ghosts = useMemo<GhostMarker[]>(() => Object.entries(you.knowledge.positions)
    .flatMap(([id, memory]) => {
      if (!memory || memory.value === you.location) return [];
      const age = dayAge(G.day, memory.asOfDay);
      return [{ label: `P${Number(id) + 1} ${age === 0 ? 'now' : `d${memory.asOfDay}`}`, node: memory.value }];
    }),
  [G.day, you.knowledge.positions, you.location]);

  const caches = useMemo(() => {
    const notes: Partial<Record<NodeId, CacheNote>> = {};
    for (const [node, memory] of Object.entries(you.knowledge.caches)) {
      if (!memory) continue;
      notes[node as NodeId] = {
        label: cacheShorthand(memory.value),
        age: dayAge(G.day, memory.asOfDay) === 0 ? 'fresh' : 'stale',
      };
    }
    return notes;
  }, [G.day, you.knowledge.caches]);

  const channel = useMemo<ChannelEntry[]>(() => {
    const planning: ChannelEntry[] = G.planningMessages.map((message) => ({
      key: `plan-${message.id}`,
      who: CHARACTER_LABELS[G.publicPlayers[message.author]!.character].toUpperCase(),
      stamp: 'DAY 0',
      meta: 'OPEN CHANNEL · no cost, no limit',
      text: message.text,
      tone: message.author === playerID ? 'you' : '',
    }));
    const inbox: ChannelEntry[] = you.inbox.map((message, index) => ({
      key: `in-${message.day}-${index}`,
      who: message.from === 'SYSTEM'
        ? 'SYSTEM'
        : `${CHARACTER_LABELS[G.publicPlayers[message.from]!.character].toUpperCase()}`,
      stamp: `DAY ${message.day} · ${message.method}`,
      meta: 'RECEIVED',
      text: message.text,
      tone: 'received',
    }));
    const bulletins: ChannelEntry[] = (you.bulletinNotebook ?? []).map((post) => ({
      key: `bul-${post.id}`,
      who: post.official ? 'OFFICIAL' : `SEAT ${Number(post.author) + 1}`,
      stamp: `DAY ${post.day} · BULLETIN`,
      meta: `${MAP_NODES[post.board].label} board · read in person`,
      text: post.text,
      tone: '',
    }));
    return [...planning, ...inbox, ...bulletins];
  }, [G.planningMessages, G.publicPlayers, playerID, you.bulletinNotebook, you.inbox]);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [channel.length]);

  const readyCount = SEAT_IDS.filter((id) => G.publicPlayers[id]?.ready).length;
  const ground = G.localCache ?? { food: 0, battery: 0 };
  const lifted = take.food + take.battery;
  const load = you.inventory.food + you.inventory.battery;
  const severedToday = G.severedEdges.map((key) => key.split('–').map((id) => MAP_NODES[id as NodeId].label.split(' ')[0]).join(' ↔ '));

  function applyTake(value: Inventory) {
    takeRef.current = value;
    setTake(value);
  }

  function bump(kind: keyof Inventory, delta: number) {
    setError(null);
    const current = takeRef.current;
    const carried = current.food + current.battery;
    const next = current[kind] + delta;
    if (next < 0) return;
    if (delta > 0) {
      if (publicYou.actionsLeft < 1) return setError({ title: 'NO ACTIONS LEFT', body: 'Both actions are spent. Unspent actions do not carry over.' });
      if (carried >= yieldPerAction) return setError({ title: `ONE ACTION LIFTS ${yieldPerAction} ITEMS`, body: 'Put one back, or spend another action.' });
      if (next > ground[kind]) return setError({ title: 'NOT THAT MUCH HERE', body: `${MAP_NODES[you.location].label} has ${ground[kind]} ${kind} on the ground.` });
      if (load + carried >= you.capacity) return setError({ title: 'HANDS FULL', body: `Carrying ${you.capacity} of ${you.capacity}.` });
    }
    applyTake({ ...current, [kind]: next });
  }

  function walkTo(node: NodeId) {
    if (!moving) return;
    setNote(null);
    setError(null);
    if (node === you.location) {
      setNote({
        title: `YOU ARE ALREADY AT ${MAP_NODES[node].label.toUpperCase()}`,
        body: `Cache here: ${cacheShorthand(ground)}. Scavenging costs an action.`,
      });
      return;
    }
    const path = shortestPath(you.location, node, G.severedEdges);
    const distance = distancesFrom(you.location, G.severedEdges)[node];
    if (!path || !Number.isFinite(distance) || distance > range) {
      const severed = clearableEdgesAt(you.location, G.severedEdges)
        .some((edge) => edge.key === edgeKey(you.location, node));
      setError(severed
        ? {
            title: `IMPASSABLE — the road to ${MAP_NODES[node].label} is severed`,
            body: 'Two players at the same endpoint can clear it, one action each. Nothing was spent.',
          }
        : {
            title: `OUT OF RANGE — ${MAP_NODES[node].label} is not within ${range} ${range === 1 ? 'road' : 'roads'}`,
            body: 'Nothing was spent.',
          });
      return;
    }
    if (publicYou.actionsLeft < 1) {
      setError({ title: 'NO ACTIONS LEFT', body: 'Both actions are spent. Unspent actions do not carry over.' });
      return;
    }
    applyTake({ food: 0, battery: 0 });
    moves.move!(path);
    toast(`Walked to ${MAP_NODES[node].label}.`);
  }

  function submitDone() {
    if (publicYou.actionsLeft > 0 && !window.confirm('Finish Move and give up unused actions?')) return;
    moves.done!(true);
    toast('Move locked. Waiting for the others.', 'info');
  }

  return (
    <main className="match-shell">
      <header className="hud">
        <div className="hud-left">
          <span className="hud-day">DAY {G.day}</span>
          <span className="hud-tag">{ctx.phase === 'move' ? 'MOVE' : 'CONTACT'}</span>
          {severedToday.length > 0 && <span className="hud-note alarm">SEVERED · {severedToday.join(' · ')}</span>}
        </div>
        <div className="hud-right">
          <span>RENDEZVOUS <strong style={{ color: 'var(--signal)' }}>
            {you.rendezvousKnowledge ? MAP_NODES[you.rendezvousKnowledge.location].label.split(' ')[0] : G.publicRendezvous}
          </strong></span>
          <span>READY <strong>{readyCount} / 4</strong></span>
          <a className="hud-link" href="/rules" rel="noreferrer" target="_blank">RULES</a>
          <span className={isConnected ? 'conn' : 'conn off'}>
            <span className={isConnected ? 'dot' : 'dot off'} />{isConnected ? 'CONNECTED' : 'RECONNECTING…'}
          </span>
        </div>
      </header>

      {G.lastPhaseCompletion && (
        <p className="phase-completion" data-testid="phase-completion">
          Day {G.lastPhaseCompletion.day} {G.lastPhaseCompletion.phase} complete · all four seats Ready
        </p>
      )}

      <div className="three-col">
        <div className="col col-left">
          <section className="card">
            <p className="card-title">You · seat {Number(playerID) + 1}</p>
            <p className="role-name">{CHARACTER_LABELS[you.character]}</p>
            <p className="role-where">
              at <strong data-testid="current-location">{you.location}</strong>
              {' · '}{you.alive ? `${publicYou.actionsLeft} ${publicYou.actionsLeft === 1 ? 'ACTION' : 'ACTIONS'} LEFT` : 'DEAD'}
            </p>
            <CharacterAbility character={you.character} />
            <div style={{ marginTop: '.8rem' }}>
              <div className="load-head"><span>CARRIED</span><strong data-testid="private-inventory">{load}/{you.capacity}</strong></div>
              <div className="loadbar">
                {Array.from({ length: you.capacity }, (_, index) => (
                  <span
                    className={index < you.inventory.food ? 'food'
                      : index < load ? 'battery'
                        : index < load + lifted ? 'pending' : ''}
                    key={index}
                  />
                ))}
              </div>
              <div className="load-legend">
                <span><span className="swatch-food">■</span> food {you.inventory.food}</span>
                <span><span className="swatch-battery">■</span> battery {you.inventory.battery}</span>
              </div>
            </div>
            {you.starvationNights > 0 && (
              <div className="notice warn" style={{ marginTop: '.7rem' }}>
                <span>
                  {you.starvationNights} hungry {you.starvationNights === 1 ? 'night' : 'nights'} behind you.
                  Go hungry again tonight and this seat dies.
                </span>
              </div>
            )}
          </section>

          {moving && (
            <section className="card">
              <div className="card-head">
                <p className="card-title">Actions · {publicYou.actionsLeft} left</p>
                <span className="hint">none carry over</span>
              </div>
              <p className="hint">Click any node on the map to walk there. Green rings are one road away.</p>
              {error && (
                <div className="notice bad" style={{ marginTop: '.6rem' }}>
                  <span aria-hidden="true">✕</span>
                  <span role="alert"><strong>{error.title}</strong><p>{error.body}</p></span>
                </div>
              )}
              {note && (
                <div className="notice good" style={{ marginTop: '.6rem' }}>
                  <span aria-hidden="true">✓</span>
                  <span role="status"><strong>{note.title}</strong><p>{note.body}</p></span>
                </div>
              )}
              {clearableEdges.map(({ key, label }) => (
                <button
                  className="quiet"
                  key={key}
                  onClick={() => { moves.clearRoad!(key); toast(`Working on the road ${label}.`, 'info'); }}
                  style={{ marginTop: '.6rem', width: '100%', textAlign: 'left' }}
                >
                  Clear the road {label} — 1 action each
                </button>
              ))}
              {clearableEdges.length === 0 && (
                <p className="hint" style={{ marginTop: '.6rem', color: 'var(--ink-faint)' }}>
                  Clear a road — no severed road at this node
                </p>
              )}
              <button className="primary" onClick={submitDone} style={{ marginTop: '.8rem', width: '100%' }}>
                DONE MOVING
              </button>
            </section>
          )}

          {moving && (
            <section className="card signal">
              <div className="card-head">
                <p className="card-title">Scavenge here</p>
                <span className="hint" style={{ color: lifted >= yieldPerAction ? 'var(--signal)' : undefined }}>
                  {lifted} of {yieldPerAction} this action
                </span>
              </div>
              <p className="hint">One action lifts up to {yieldPerAction} items.</p>
              <div className="stack" style={{ marginTop: '.7rem' }}>
                {(['food', 'battery'] as const).map((kind) => (
                  <div className="stepper-row" key={kind}>
                    <div>
                      <div className={`label ${kind}`}>{kind.toUpperCase()}</div>
                      <div className={ground[kind] ? 'ground' : 'ground empty'}>
                        {ground[kind] ? `${ground[kind]} on the ground` : 'none here'}
                      </div>
                    </div>
                    <div className="stepper">
                      <button aria-label={`Take one less ${kind}`} onClick={() => bump(kind, -1)} type="button">−</button>
                      <span aria-live="polite" className="value" data-testid={`take-${kind}`}>{take[kind]}</span>
                      <button aria-label={`Take one more ${kind}`} onClick={() => bump(kind, 1)} type="button">+</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="scavenge-summary">
                <span>carrying {load}/{you.capacity}{lifted ? ` → ${load + lifted}/${you.capacity}` : ''}</span>
                <span>
                  {lifted
                    ? `${MAP_NODES[you.location].label.split(' ')[0]} left with food ${ground.food - take.food}, batt ${ground.battery - take.battery}`
                    : 'nothing picked up yet'}
                </span>
              </div>
              <button
                className={lifted ? 'primary' : ''}
                disabled={!lifted}
                onClick={() => {
                  moves.scavenge!(take);
                  toast(`Picked up ${[take.food ? `${take.food} food` : '', take.battery ? `${take.battery} battery` : ''].filter(Boolean).join(' and ')} — 1 action.`);
                  applyTake({ food: 0, battery: 0 });
                }}
                style={{ marginTop: '.75rem', width: '100%' }}
              >
                {lifted ? `TAKE ${lifted} — 1 ACTION` : 'PICK SOMETHING UP'}
              </button>
              {you.character === 'STORE_OWNER' && (
                <details className="exchange" style={{ marginTop: '.75rem' }}>
                  <summary>Leave items in this cache</summary>
                  <div className="resource-pair">
                    <label>Food<input min="0" onChange={(event) => setDrop({ ...drop, food: Number(event.target.value) })} type="number" value={drop.food} /></label>
                    <label>Battery<input min="0" onChange={(event) => setDrop({ ...drop, battery: Number(event.target.value) })} type="number" value={drop.battery} /></label>
                  </div>
                  <button className="quiet" onClick={() => { moves.dropItems!(drop); toast('Left in this cache.'); }}>Drop items</button>
                </details>
              )}
            </section>
          )}

          {contacting && <FacilitiesPanel G={G} moves={moves} playerID={playerID} />}

          <section className="card">
            <div className="card-head">
              <p className="card-title">Seats</p>
              <span className="hint">public</span>
            </div>
            <div className="seat-list">
              {SEAT_IDS.map((id) => {
                const seat = G.publicPlayers[id];
                if (!seat) return null;
                return (
                  <div data-testid={`player-public-${id}`} key={id}>
                    <span>
                      {id === playerID ? 'You' : Number(id) + 1} · {CHARACTER_LABELS[seat.character]}
                    </span>
                    <span className="muted" data-testid={`player-state-${id}`}>
                      {seat.actionsLeft} act ·{' '}
                      <span className={seat.ready ? 'state-ready' : 'state-idle'}>{seat.ready ? 'READY' : 'WAITING'}</span>
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="information-key" style={{ marginTop: '.6rem' }}>
              Methods, resource availability, actions and readiness are public. Exact counts and locations are not.
            </p>
          </section>
        </div>

        <div className="col">
          <section className="map-frame">
            <header>
              <p className="card-title">{moving ? 'Your map · click a node to walk there' : 'Your map · exact only where observed'}</p>
              <span className="hint">numbers = supplies you have seen · grey italic = old memory</span>
            </header>
            <VillageMap
              ariaLabel="Village map"
              caches={caches}
              ghosts={ghosts}
              height={460}
              labels="compact"
              onNodeClick={moving ? walkTo : undefined}
              reach={moving && publicYou.actionsLeft > 0 ? reachable : []}
              severedEdges={G.severedEdges}
              withYou={withYou}
              you={you.location}
            />
            {moving && (
              <div className="destinations">
                <strong>REACHABLE</strong>
                {reachable.map((node) => (
                  <button key={node} onClick={() => walkTo(node)}>{MAP_NODES[node].label}</button>
                ))}
              </div>
            )}
            <div className="map-legend">
              <span className="sig">B bulletin board</span>
              <span className="sig">P landline phone</span>
              <span className="sig">H high ground</span>
              <span className="sig">━ free bridge crossing</span>
              <span className="grn">◌ one road away</span>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <p className="card-title">Telecom matrix</p>
              <span className="hint">who holds what is public · whether they are in range is not</span>
            </div>
            <div className="matrix" style={{ gridTemplateColumns: '150px repeat(7, minmax(0, 1fr))' }}>
              <div />
              {METHOD_ORDER.map((method) => <div className="head" key={`h-${method}`}>{METHOD_COLUMN[method]}</div>)}
              {SEAT_IDS.map((id) => {
                const seat = G.publicPlayers[id];
                if (!seat) return null;
                return (
                  <div data-testid={`telecom-row-${id}`} key={`row-${id}`} style={{ display: 'contents' }}>
                    <div className="rowname">{id === playerID ? 'You' : Number(id) + 1} · {CHARACTER_LABELS[seat.character]}</div>
                    {METHOD_ORDER.map((method) => {
                      const held = seat.methods.includes(method);
                      const shared = held && you.methods.includes(method);
                      const dead = isDeadOnDay(method, G.day);
                      const className = shared && !dead ? 'cell shared' : held ? (dead ? 'cell held dead' : 'cell held') : 'cell';
                      return (
                        <div
                          className={className}
                          key={`${id}-${method}`}
                          title={`${METHOD_LABELS[method]} · ${held ? 'held' : 'not held'}${dead ? ' · down today' : ''}`}
                        >{held ? METHOD_LETTER[method] : ''}</div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <div className="matrix-legend">
              <span style={{ color: 'var(--fresh)' }}>■ you both hold it, still up today</span>
              <span>■ they hold it, you do not</span>
              <span style={{ color: '#5c6b62' }}>■ held, but down today</span>
            </div>
          </section>

          <div className="pair-grid">
            <section className="card memories">
              <p className="card-title">Cache notebook</p>
              <div className="ledger" style={{ marginTop: '.5rem' }}>
                {Object.entries(you.knowledge.caches).length === 0 && <p className="hint">Nothing observed yet.</p>}
                {Object.entries(you.knowledge.caches).map(([node, memory]) => {
                  const age = dayAge(G.day, memory!.asOfDay);
                  return (
                    <div key={node}>
                      <span className="what">{MAP_NODES[node as NodeId].label.split(' ')[0]}</span>
                      <span>
                        {cacheShorthand(memory!.value).toLowerCase()}{' '}
                        <span className={age === 0 ? 'fresh' : 'stale'}>{age === 0 ? 'seen today' : `${age}d old`}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="card">
              <p className="card-title">What the others can see about you</p>
              <div className="ledger" style={{ marginTop: '.5rem' }}>
                <div><span>Your methods</span><span className="what">{you.methods.map((method) => METHOD_LABELS[method]).join(', ') || 'none'}</span></div>
                <div><span>That you have food</span><span className="what">{publicYou.hasFood ? 'yes' : 'no'} <span className="stale">(not how much)</span></span></div>
                <div><span>That you have battery</span><span className="what">{publicYou.hasBattery ? 'yes' : 'no'} <span className="stale">(not how much)</span></span></div>
                <div><span>Your location</span><span className="no">no — only where they last saw you</span></div>
              </div>
            </section>
          </div>

          <section className="card intelligence">
            <p className="card-title">Private intelligence</p>
            {you.rendezvousKnowledge
              ? <p className="hint" style={{ marginTop: '.5rem' }}>
                  <strong style={{ color: 'var(--signal)' }}>Current rendezvous: {MAP_NODES[you.rendezvousKnowledge.location].label}</strong>
                  <DayStamp currentDay={G.day} observedDay={you.rendezvousKnowledge.learnedDay} verb={`Learned by ${you.rendezvousKnowledge.source.toLowerCase()} on`} />
                </p>
              : <p className="hint" style={{ marginTop: '.5rem' }}>The true current rendezvous is unknown.</p>}
            <h3>Bodies discovered</h3>
            {Object.entries(you.knowledge.bodies).length === 0 && <p className="hint">None.</p>}
            {Object.entries(you.knowledge.bodies).map(([id, memory]) => (
              <p className="hint" key={id}>
                Seat {Number(id) + 1} at {MAP_NODES[memory!.value].label}
                <DayStamp currentDay={G.day} observedDay={memory!.asOfDay} verb="Discovered" />
              </p>
            ))}
            <div data-testid="shared-comms-plan">
            <h3>Shared comms plan · locked · revision {G.commsPlan.revision}</h3>
            <div className="ledger">
              <div><span>Fallback</span><span className="what">{G.commsPlan.fallbackProtocol || 'Not specified'}</span></div>
              <div><span>Shorthand</span><span className="what">{G.commsPlan.reportingShorthand || 'Not specified'}</span></div>
              <div><span>Notes</span><span className="what">{G.commsPlan.notes || 'None'}</span></div>
            </div>
            </div>
          </section>
        </div>

        <div className="col col-right">
          <div className="channel">
            <header>
              <span className="channel-title">OPEN CHANNEL</span>
              <span className="channel-count">{channel.length} ENTRIES · SCROLL BACK TO DAY 0</span>
            </header>
            <div aria-label="Open channel" className="channel-log" ref={logRef}>
              <p className="marker">— DAY 0 · CHANNEL OPEN —</p>
              {channel.length === 0 && <p className="hint">Nothing has reached you yet.</p>}
              {channel.map((entry) => (
                <article className={entry.tone ? `entry ${entry.tone}` : 'entry'} key={entry.key}>
                  <div className="who">
                    <span>{entry.who}</span>
                    <span className="stamp">{entry.stamp}</span>
                  </div>
                  <div className="meta">{entry.meta}</div>
                  <p className="body">{entry.text}</p>
                </article>
              ))}
            </div>
            {contacting && <CommsPanel G={G} moves={moves} playerID={playerID} />}
            {contacting && (
              <div className="composer night-close" style={{ borderTop: 0, paddingTop: 0 }}>
                <RadioCard G={G} moves={moves} playerID={playerID} />
                <button
                  className="ghost"
                  onClick={() => { moves.ready!(); toast('Ready for night. Waiting for the others.', 'info'); }}
                >
                  READY FOR NIGHT
                </button>
              </div>
            )}
            {you.alive && publicYou.ready && (
              <div className="composer">
                <p className="hint good"><strong>Ready locked.</strong> Waiting for the phase transition.</p>
              </div>
            )}
            {!you.alive && (
              <div className="composer">
                <p className="hint warn">You can no longer act or speak.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
