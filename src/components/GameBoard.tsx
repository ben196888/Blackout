import type { BoardProps } from 'boardgame.io/react';
import { useMemo, useState } from 'react';
import { CHARACTER_LABELS } from '../constants';
import { MAP_EDGES, MAP_NODES, NODE_IDS, distancesFrom, edgeKey, shortestPath } from '../game/map';
import type { Inventory, NodeId, PlayerID, PlayerViewState } from '../types';

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
          {ctx.phase === 'move' && you.alive && (
            <div className="destinations">
              <strong>Reachable:</strong>
              {reachable.map((node) => <button key={node} onClick={() => moves.move!(shortestPath(you.location, node, G.severedEdges)!)}>{MAP_NODES[node].label}</button>)}
            </div>
          )}
        </section>

        <aside className="side-stack">
          <section className="panel">
            <p className="eyebrow">You</p>
            <h2>{CHARACTER_LABELS[you.character]}</h2>
            <p><strong data-testid="current-location">{you.location}</strong> · {you.alive ? 'Alive' : 'Dead'}</p>
            <p>Food {you.inventory.food} · Battery {you.inventory.battery} · Load {you.inventory.food + you.inventory.battery}/{you.capacity}</p>
            <p>Actions {publicYou.actionsLeft}</p>
            <p>Local cache: Food {G.localCache?.food ?? 0} · Battery {G.localCache?.battery ?? 0}</p>
          </section>

          {ctx.phase === 'move' && you.alive && (
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

          {ctx.phase === 'contact' && you.alive && <section className="panel"><p>Contact facilities arrive in M3.</p><button className="primary" onClick={() => moves.ready!()}>Ready for night</button></section>}
          {!you.alive && <section className="panel"><p>You can no longer act or speak.</p></section>}
        </aside>
      </div>
    </main>
  );
}

function ResourceFields({ label, value, onChange }: { label: string; value: Inventory; onChange: (value: Inventory) => void }) {
  return <fieldset><legend>{label}</legend><label>Food<input min="0" type="number" value={value.food} onChange={(event) => onChange({ ...value, food: Number(event.target.value) })} /></label><label>Battery<input min="0" type="number" value={value.battery} onChange={(event) => onChange({ ...value, battery: Number(event.target.value) })} /></label></fieldset>;
}
