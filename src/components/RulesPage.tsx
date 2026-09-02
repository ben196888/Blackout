import { useMemo, useState } from 'react';
import { ACTIONS_PER_DAY, DEFAULT_RENDEZVOUS } from '../constants';
import { MAP_NODES, NODE_IDS, distancesFrom } from '../game/map';
import type { DeliveryMethodId, NodeId } from '../types';
import { TrialNotice } from './TrialNotice';
import { VillageMap } from './VillageMap';

/** The explorer stands you at the fallback rendezvous, the one node everyone knows. */
const VANTAGE: NodeId = DEFAULT_RENDEZVOUS;

interface ReachSpec {
  id: DeliveryMethodId;
  label: string;
  tag: string;
  blurb: string;
  reach: (from: NodeId) => NodeId[];
}

const within = (from: NodeId, radius: number) =>
  NODE_IDS.filter((node) => node !== from && distancesFrom(from)[node] <= radius);

/** Reach is derived from the live map so this page cannot drift from the engine. */
export const REACH_SPECS: ReachSpec[] = [
  {
    id: 'WALKIE', label: 'Walkie-talkie', tag: '1 hop',
    blurb: 'Everyone within one road hears it, whether you meant them to or not. 40 characters. One battery buys three sends. The Reservist reaches two roads.',
    reach: (from) => within(from, 1),
  },
  {
    id: 'MESH', label: 'Mesh', tag: '1 hop + relay',
    blurb: 'One hop, but a third player standing between you and your target relays it for free. 40 characters, one battery per two sends. The Student sends two hops unaided.',
    reach: (from) => within(from, 1),
  },
  {
    id: 'BULLETIN', label: 'Bulletin board', tag: 'here only',
    blurb: 'Pin a notice at the board you are standing at. Free, no length limit, and it stays there — but only people who walk to that board will ever read it.',
    reach: (from) => [from],
  },
  {
    id: 'LANDLINE', label: 'Landline', tag: '4 phones',
    blurb: 'Ring another phone node and whoever is standing there picks up. Free, but one dial per day, and the lines go dead from Day 3.',
    reach: (from) => NODE_IDS.filter((node) => node !== from && MAP_NODES[node].landline),
  },
  {
    id: 'SMS', label: 'SMS', tag: 'anywhere',
    blurb: 'Reaches anyone anywhere while the network holds — 20 characters only, and everything past that is silently cut. Dies after Day 2.',
    reach: (from) => NODE_IDS.filter((node) => node !== from),
  },
  {
    id: 'MOBILE_VOICE', label: 'Mobile voice', tag: 'Day 1 only',
    blurb: 'A real conversation with anyone, anywhere — on Day 1 only, and half of all calls drop. After that the towers are gone.',
    reach: (from) => NODE_IDS.filter((node) => node !== from),
  },
  {
    id: 'MOBILE_DATA', label: 'Mobile data', tag: 'Day 6 only',
    blurb: 'Dead until Day 6, when a cell-on-wheels lights up everything within two roads of the School and of the rendezvous. Both ends have to stand inside it.',
    reach: (from) => within(from, 2),
  },
  {
    id: 'FACE_TO_FACE', label: 'Face to face', tag: 'same node',
    blurb: 'Free, unlimited, and the only method that tells you it landed. Everything else you send into the dark.',
    reach: (from) => [from],
  },
];

const METHOD_TABLE = [
  { name: 'Walkie-talkie', reach: '1 road', cap: '40', batt: '1 per 3 sends', down: 'Never — the spine of the game' },
  { name: 'Mesh', reach: '1 road + relay', cap: '40', batt: '1 per 2 sends', down: 'Never' },
  { name: 'Bulletin board', reach: 'Where you stand', cap: 'none', batt: 'free', down: 'Never — but somebody must walk there' },
  { name: 'Landline', reach: '4 phone nodes', cap: 'none', batt: 'free, 1 dial/day', down: 'Day 3' },
  { name: 'SMS', reach: 'Anywhere', cap: '20', batt: '1 per day, first use', down: 'Day 3 · a quarter drop on Day 2' },
  { name: 'Mobile voice', reach: 'Anywhere', cap: 'none', batt: '1 per day, first use', down: 'Day 2 · half drop on Day 1' },
  { name: 'Mobile data', reach: '2 roads of School / rendezvous', cap: 'none', batt: '1 per day, first use', down: 'Up on Day 6 only' },
  { name: 'Face to face', reach: 'Same node', cap: 'none', batt: 'free', down: 'Never · the only confirmed delivery' },
];

const SCHEDULE = [
  { day: 1, event: 'Grid down', detail: 'Mobile voice still works — half the calls drop', tone: 'var(--fresh)' },
  { day: 2, event: 'Backups exhausted', detail: 'Co-op road cut · exposure night · voice gone', tone: 'var(--signal)' },
  { day: 3, event: 'Bridge span severed', detail: 'The village splits in two · SMS and landline die', tone: 'var(--danger)' },
  { day: 4, event: 'Official rendezvous changes', detail: 'Only the radio and the Village Office board carry it', tone: 'var(--signal)' },
  { day: 5, event: 'Power scarcity', detail: 'Every battery cost doubles · exposure night', tone: 'var(--danger)' },
  { day: 6, event: 'Cell-on-wheels online', detail: 'Mobile data, two roads out, for one day', tone: 'var(--fresh)' },
  { day: 7, event: 'Final convergence', detail: 'Where you stand at dawn is where you are scored', tone: 'var(--signal)' },
];

const PHASES = [
  { n: '01', tone: '', title: 'Day 0 — Plan', body: 'Everyone picks exactly four methods (the Student gets five) and writes one shared comms plan. Choices are public. After this, no renegotiation.' },
  { n: '02', tone: 'move', title: 'Move', body: `${ACTIONS_PER_DAY} actions a day. Walk one road, scavenge a cache, or pair up with someone at your node to clear a severed road.` },
  { n: '03', tone: 'move', title: 'Contact', body: 'Send on the methods you hold. Both sides must hold the same method. Only face-to-face tells you whether it landed.' },
  { n: '04', tone: 'night', title: 'Night', body: 'Everyone eats one food, two on an exposure night in the open. Two hungry nights in a row and that seat dies.' },
];

export function RulesPage() {
  const [method, setMethod] = useState<DeliveryMethodId>('WALKIE');
  const selected = REACH_SPECS.find((spec) => spec.id === method) ?? REACH_SPECS[0]!;
  const reach = useMemo(() => selected.reach(VANTAGE), [selected]);

  return (
    <main className="rules">
      <header className="rules-hero">
        <div>
          <p className="kicker">PACE POC · FOUR SEATS · SEVEN NIGHTS</p>
          <h1>BLACKOUT</h1>
          <p>
            Four survivors are scattered across a village after a blackout. Each has private
            information, a private inventory, and a limited set of ways to reach the others. You
            spend Day 0 negotiating who covers which method, then live with those choices for seven
            nights.
          </p>
        </div>
        <TrialNotice />
      </header>

      <section className="rules-section">
        <h2>01 · How a day runs</h2>
        <div className="day-cards">
          {PHASES.map((phase) => (
            <article className={`day-card ${phase.tone}`} key={phase.n}>
              <div className="num">{phase.n}</div>
              <h3>{phase.title}</h3>
              <p>{phase.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rules-section">
        <h2>02 · Who can you actually reach</h2>
        <p className="sub">
          You are standing at the {MAP_NODES[VANTAGE].label}. Pick a method to see how far it carries.
        </p>
        <div className="reach-explorer">
          <div>
            <div className="reach-picker" role="group" aria-label="Communication methods">
              {REACH_SPECS.map((spec) => (
                <button
                  aria-pressed={spec.id === method}
                  key={spec.id}
                  onClick={() => setMethod(spec.id)}
                  type="button"
                >
                  <span>{spec.label}</span>
                  <span className="tag">{spec.tag}</span>
                </button>
              ))}
            </div>
            <div className="reach-blurb">
              <p className="card-title">Reach</p>
              <p>{selected.blurb}</p>
            </div>
          </div>
          <div className="map-frame">
            <VillageMap
              ariaLabel={`Village map showing ${selected.label} reach from the ${MAP_NODES[VANTAGE].label}`}
              height={520}
              reach={reach}
              you={VANTAGE}
            />
            <div className="map-legend">
              <span className="sig">B bulletin board</span>
              <span className="sig">P landline phone</span>
              <span className="sig">H high ground</span>
              <span className="sig">━ free bridge crossing</span>
              <span className="grn">◌ reachable on this method</span>
            </div>
          </div>
        </div>
      </section>

      <section className="rules-section">
        <h2>03 · Quick reference — the seven methods</h2>
        <p className="sub">Both sender and recipient must hold the method. Print this card.</p>
        <div className="ref-table ref-scroll">
          <table>
            <thead>
              <tr><th>Method</th><th>Reach</th><th>Cap</th><th>Battery</th><th>Goes down</th></tr>
            </thead>
            <tbody>
              {METHOD_TABLE.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td><td>{row.reach}</td><td>{row.cap}</td><td>{row.batt}</td><td>{row.down}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rules-section pair-grid">
        <div>
          <h2>04 · The seven nights</h2>
          <div className="schedule">
            {SCHEDULE.map((entry) => (
              <div key={entry.day}>
                <span className="day" style={{ color: entry.tone }}>DAY {entry.day}</span>
                <span className="event">{entry.event}</span>
                <span className="detail">{entry.detail}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2>05 · How it ends</h2>
          <div className="scoring">
            <div><span className="stars">★★★</span><p>All four alive and standing on the true rendezvous after night 7.</p></div>
            <div><span className="stars">★★</span><p>All four alive, but not everyone made the rendezvous.</p></div>
            <div><span className="stars">★</span><p>At least one survivor.</p></div>
            <div><span className="stars none">—</span><p style={{ color: 'var(--danger)' }}>Nobody left. The match ends the moment the last seat dies.</p></div>
            <span className="footnote">
              The rendezvous is the {MAP_NODES[DEFAULT_RENDEZVOUS].label} until Day 4, when it
              changes. Only the nightly radio and the Village Office board carry the new one — and
              the radio costs a battery every time you listen.
            </span>
          </div>
        </div>
      </section>

      <section className="rules-section">
        <a className="hud-link" href="/">← Back to the lobby</a>
      </section>
    </main>
  );
}
