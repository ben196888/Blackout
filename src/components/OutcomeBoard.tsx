import { CHARACTER_LABELS } from '../constants';
import { MAP_NODES } from '../game/map';
import type { PlayerID, TerminalPlayerReveal, TerminalOutcome } from '../types';

export function OutcomeBoard({ outcome }: { outcome: TerminalOutcome }) {
  const { calculation } = outcome;
  const title = calculation.stars === 0
    ? 'Everyone was lost'
    : `${calculation.stars} ${calculation.stars === 1 ? 'star' : 'stars'}`;
  return (
    <main className="game-shell outcome-shell">
      <header className="panel outcome-summary">
        <p className="eyebrow">After Night {outcome.endedAfterNight} · complete truth revealed</p>
        <h1>{title}</h1>
        <p className="stars" aria-label={`${calculation.stars} stars`}>{'★'.repeat(calculation.stars)}{'☆'.repeat(3 - calculation.stars)}</p>
        <p>The true rendezvous was <strong>{MAP_NODES[outcome.trueRendezvous].label}</strong>.</p>
        <p>{calculation.survivorCount} of 4 survived. {calculation.allPlayersSurvived
          ? calculation.allSurvivorsAtTrueRendezvous
            ? 'All four reached the true rendezvous.'
            : 'All four survived, but did not all reach the true rendezvous.'
          : calculation.survivorCount > 0
            ? 'At least one player survived.'
            : 'No player survived.'}</p>
      </header>
      <section className="outcome-grid">
        {(Object.entries(outcome.players) as Array<[PlayerID, TerminalPlayerReveal]>).map(([id, player]) => (
          <article className="panel" key={id}>
            <p className="eyebrow">Seat {Number(id) + 1} · {player.alive ? 'Survived' : 'Died'}</p>
            <h2>{CHARACTER_LABELS[player.character]}</h2>
            <p><strong>{player.alive ? 'Final location' : 'Body location'}:</strong> {MAP_NODES[player.finalLocation].label}</p>
            <p><strong>Inventory:</strong> Food {player.inventory.food} · Battery {player.inventory.battery}</p>
            <p><strong>Starvation nights:</strong> {player.starvationNights}</p>
            <DiscoveryList player={player} />
          </article>
        ))}
      </section>
    </main>
  );
}

function DiscoveryList({ player }: { player: TerminalPlayerReveal }) {
  const { knowledge, rendezvousKnowledge, bulletinNotebook } = player.discoveries;
  return <details><summary>Discoveries</summary>
    <p>{rendezvousKnowledge
      ? `Rendezvous ${MAP_NODES[rendezvousKnowledge.location].label}, learned Day ${rendezvousKnowledge.learnedDay} by ${rendezvousKnowledge.source.toLowerCase()}.`
      : 'Did not learn the changed rendezvous.'}</p>
    <h3>Bodies found</h3>
    {Object.entries(knowledge.bodies).length === 0 && <p>None.</p>}
    {Object.entries(knowledge.bodies).map(([id, memory]) => <p key={id}>Seat {Number(id) + 1} at {MAP_NODES[memory!.value].label}, Day {memory!.asOfDay}</p>)}
    <h3>Position observations</h3>
    {Object.entries(knowledge.positions).length === 0 && <p>None.</p>}
    {Object.entries(knowledge.positions).map(([id, memory]) => <p key={id}>Seat {Number(id) + 1} at {MAP_NODES[memory!.value].label}, as of Day {memory!.asOfDay}</p>)}
    <h3>Cache observations</h3>
    {Object.entries(knowledge.caches).map(([node, memory]) => <p key={node}>{MAP_NODES[node as keyof typeof MAP_NODES].label}: Food {memory!.value.food}, Battery {memory!.value.battery}, as of Day {memory!.asOfDay}</p>)}
    <h3>Bulletins read</h3>
    {bulletinNotebook.length === 0 && <p>None.</p>}
    {bulletinNotebook.map((post) => <p key={post.id}>{MAP_NODES[post.board].label}, Day {post.day}: {post.text}</p>)}
  </details>;
}
