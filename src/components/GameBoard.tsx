import type { BoardProps } from 'boardgame.io/react';
import { useMemo, useState } from 'react';
import { CHARACTER_LABELS, METHOD_LABELS } from '../constants';
import { MAP_EDGES, MAP_NODES, NODE_IDS, distancesFrom, edgeKey, shortestPath } from '../game/map';
import type { Inventory, NodeId, PlayerID, PlayerViewState } from '../types';
import { CommsPanel } from './CommsPanel';
import { FacilitiesPanel } from './FacilitiesPanel';

const POSITIONS: Record<NodeId, [number, number]> = {
  STORE: [90, 80], TEMPLE: [210, 55], VO: [330, 80], BRIDGE_N: [450, 110],
  BRIDGE_S: [520, 180], SCHOOL: [610, 220], CLINIC: [720, 165], FIELD: [700, 300],
  FORD: [600, 370], TEA: [480, 410], POND: [470, 520], COOP: [350, 440],
  MTNRD: [245, 390], FOREST: [140, 345], QUARRY: [75, 245], SHRINE: [50, 150],
};

type GameBoardProps = Pick<BoardProps<PlayerViewState>, 'G' | 'ctx' | 'moves' | 'playerID' | 'isConnected'>;

export function GameBoard({ G, ctx, moves, playerID, isConnected }: GameBoardProps) {
  const you = G.you!;
  const publicYou = G.publicPlayers[playerID as PlayerID];
  const [take, setTake] = useState<Inventory>({ food: 0, battery: 0 });
  const [drop, setDrop] = useState<Inventory>({ food: 0, battery: 0 });
  const range = you.character === 'RESERVIST' ? 2 : 1;
  const reachable = useMemo(() => {
    const distance = distancesFrom(you.location, G.severedEdges);
    return NODE_IDS.filter((node) => node !== you.location && distance[node] <= range);
  }, [G.severedEdges, range, you.location]);

  function submitDone() {
    if (publicYou.actionsLeft > 0 && !window.confirm('Finish Move and give up unused actions?')) return;
    moves.done!(true);
  }

  return (
    <main className="game-shell">
      <header className="statusbar">
        <strong>Day {G.day}</strong>
        <span>{ctx.phase === 'move' ? 'Move' : 'Contact'}</span>
        <span>{isConnected ? 'Connected' : 'Reconnecting…'}</span>
      </header>
      <div className="board-grid">
        <section className="panel map-panel">
          <p className="eyebrow">Your map · exact only where observed</p>
          <svg aria-label="Village map" className="map" viewBox="0 0 800 580">
            {MAP_EDGES.map((edge) => {
              const [x1, y1] = POSITIONS[edge.a];
              const [x2, y2] = POSITIONS[edge.b];
              const severed = G.severedEdges.includes(edgeKey(edge.a, edge.b));
              return <line className={severed ? 'edge severed' : edge.cost === 0 ? 'edge bridge' : 'edge'} key={edgeKey(edge.a, edge.b)} x1={x1} y1={y1} x2={x2} y2={y2} />;
            })}
            {NODE_IDS.map((node) => {
              const [x, y] = POSITIONS[node];
              const memory = Object.entries(you.knowledge.positions).filter(([, item]) => item?.value === node);
              return (
                <g className={node === you.location ? 'node current' : 'node'} key={node} transform={`translate(${x},${y})`}>
                  <circle r="30" />
                  <text textAnchor="middle" y="-4">{MAP_NODES[node].label}</text>
                  {node === you.location && <text className="you-token" textAnchor="middle" y="14">YOU</text>}
                  {memory.map(([id, item], index) => <text className="ghost" key={id} textAnchor="middle" y={32 + index * 12}>P{Number(id) + 1} · Day {item!.asOfDay}</text>)}
                </g>
              );
            })}
          </svg>
          {ctx.phase === 'move' && you.alive && !publicYou.ready && (
            <div className="destinations">
              <strong>Reachable:</strong>
              {reachable.map((node) => <button key={node} onClick={() => moves.move!(shortestPath(you.location, node, G.severedEdges)!)}>{MAP_NODES[node].label}</button>)}
            </div>
          )}
        </section>

        <aside className="side-stack">
          <section className="panel">
            <p className="eyebrow">Your private current status</p>
            <h2>{CHARACTER_LABELS[you.character]}</h2>
            <p><strong data-testid="current-location">{you.location}</strong> · {you.alive ? 'Alive' : 'Dead'}</p>
            <p data-testid="private-inventory">Food {you.inventory.food} · Battery {you.inventory.battery} · Load {you.inventory.food + you.inventory.battery}/{you.capacity}</p>
            <p>Actions {publicYou.actionsLeft}</p>
            <p>Current local cache: Food {G.localCache?.food ?? 0} · Battery {G.localCache?.battery ?? 0}</p>
            <h3>Public roster</h3>
            <p className="information-key">Methods, resource availability, actions and readiness are public. Exact counts and locations are private.</p>
            <div className="public-status">
              {Object.entries(G.publicPlayers).map(([id, player]) => <article data-testid={`player-public-${id}`} key={id}>
                <strong>Seat {Number(id) + 1} · {CHARACTER_LABELS[player.character]}</strong>
                <span>{player.methods.map((method) => METHOD_LABELS[method]).join(', ')}</span>
                <small data-testid={`player-state-${id}`}>{player.hasFood ? 'Food available' : 'Food unavailable'} · {player.hasBattery ? 'Battery available' : 'Battery unavailable'} · {player.actionsLeft} actions · {player.ready ? 'Ready' : 'Not ready'}</small>
              </article>)}
            </div>
          </section>

          {ctx.phase === 'move' && you.alive && !publicYou.ready && (
            <section className="panel actions">
              <p className="eyebrow">Move actions</p>
              <ResourceFields label="Scavenge" value={take} onChange={setTake} />
              <button onClick={() => moves.scavenge!(take)}>Take items</button>
              {you.character === 'STORE_OWNER' && <><ResourceFields label="Drop" value={drop} onChange={setDrop} /><button onClick={() => moves.dropItems!(drop)}>Drop items</button></>}
              {G.severedEdges.map((key) => <button key={key} onClick={() => moves.clearRoad!(key)}>Contribute to clear {key}</button>)}
              <button className="primary" onClick={submitDone}>Done moving</button>
            </section>
          )}

          <section className="panel memories">
            <p className="eyebrow">Cache notebook</p>
            {Object.entries(you.knowledge.caches).map(([node, memory]) => <p key={node}><strong>{node}</strong> Food {memory!.value.food}, Battery {memory!.value.battery} <span className="as-of">as of Day {memory!.asOfDay}</span></p>)}
          </section>

          <section className="panel intelligence">
            <p className="eyebrow">Private intelligence</p>
            {you.rendezvousKnowledge
              ? <p><strong>Current rendezvous: {MAP_NODES[you.rendezvousKnowledge.location].label}</strong><span className="as-of">learned on Day {you.rendezvousKnowledge.learnedDay} by {you.rendezvousKnowledge.source.toLowerCase()}</span></p>
              : <p>The true current rendezvous is unknown.</p>}
            <h3>Bulletin notebook</h3>
            {!you.bulletinNotebook?.length && <p>No bulletin posts read yet.</p>}
            {you.bulletinNotebook?.map((post) => <article key={post.id}><strong>{MAP_NODES[post.board].label} · {post.author === 'SYSTEM' ? 'Official' : `Seat ${Number(post.author) + 1}`}</strong><span className="as-of">posted on Day {post.day}</span><p>{post.text}</p></article>)}
            <h3>Bodies discovered</h3>
            {Object.entries(you.knowledge.bodies).length === 0 && <p>None.</p>}
            {Object.entries(you.knowledge.bodies).map(([id, memory]) => <article key={id}><p>Seat {Number(id) + 1} at {MAP_NODES[memory!.value].label}<span className="as-of">discovered on Day {memory!.asOfDay}</span></p></article>)}
            <h3>Private inbox</h3>
            {you.inbox.length === 0 && <p>No messages yet.</p>}
            {you.inbox.map((message, index) => <article key={`${message.day}-${index}`}><strong>{message.method} · from {message.from === 'SYSTEM' ? 'System' : `Seat ${Number(message.from) + 1}`}</strong><span className="as-of">received on Day {message.day}</span><p>{message.text}</p></article>)}
          </section>

          {ctx.phase === 'contact' && you.alive && !publicYou.ready && <><CommsPanel G={G} moves={moves} playerID={playerID} /><FacilitiesPanel G={G} moves={moves} playerID={playerID} /><section className="panel"><button className="primary" onClick={() => moves.ready!()}>Ready for night</button></section></>}
          {you.alive && publicYou.ready && <section className="panel"><p><strong>Ready locked.</strong> Waiting for the phase transition.</p></section>}
          {!you.alive && <section className="panel"><p>You can no longer act or speak.</p></section>}
        </aside>
      </div>
    </main>
  );
}

function ResourceFields({ label, value, onChange }: { label: string; value: Inventory; onChange: (value: Inventory) => void }) {
  return <fieldset><legend>{label}</legend><label>Food<input min="0" type="number" value={value.food} onChange={(event) => onChange({ ...value, food: Number(event.target.value) })} /></label><label>Battery<input min="0" type="number" value={value.battery} onChange={(event) => onChange({ ...value, battery: Number(event.target.value) })} /></label></fieldset>;
}
