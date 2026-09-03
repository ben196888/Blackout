import { Fragment, useMemo, useState } from 'react';
import { ACTIONS_PER_DAY, DEFAULT_RENDEZVOUS } from '../constants';
import { MAP_NODES, NODE_IDS, distancesFrom } from '../game/map';
import type { DeliveryMethodId, NodeId } from '../types';
import { TrialNotice } from './TrialNotice';
import { NODE_SHORT_NAMES, VillageMap } from './VillageMap';

/** The explorer stands you at the fallback rendezvous, the one node everyone knows. */
const VANTAGE: NodeId = DEFAULT_RENDEZVOUS;

type ReachGroup = 'Telecom methods' | 'Role abilities' | 'Environment';

interface ReachSpec {
  id: string;
  group: ReachGroup;
  label: string;
  tag: string;
  blurb: string;
  /** Where the sender must stand. Pinned methods ignore the movable vantage. */
  origin?: NodeId;
  /** Whether the reader may walk the vantage around the map on this method. */
  movable?: true;
  /** High ground is sight, not a message; the panel and legend say so. */
  sight?: true;
  reach: (from: NodeId) => NodeId[];
  /** Nodes this method only reaches through a third player standing in between. */
  relay?: (from: NodeId) => NodeId[];
}

const within = (from: NodeId, radius: number) =>
  NODE_IDS.filter((node) => node !== from && distancesFrom(from)[node] <= radius);

const ringAt = (from: NodeId, radius: number) =>
  NODE_IDS.filter((node) => node !== from && distancesFrom(from)[node] === radius);

/** Reach is derived from the live map so this page cannot drift from the engine. */
export const REACH_SPECS: ReachSpec[] = [
  {
    id: 'WALKIE', group: 'Telecom methods', label: 'Walkie-talkie', tag: '1 hop',
    blurb: 'Everyone within one road hears it, whether you meant them to or not. 40 characters. One battery buys three sends. The Reservist reaches two roads.',
    movable: true,
    reach: (from) => within(from, 1),
  },
  {
    id: 'MESH', group: 'Telecom methods', label: 'Mesh', tag: '1 hop + relay',
    blurb: 'On its own it goes one road, like the walkie. But a third living player standing one road from you and one road from your target passes it on for free — so anyone two roads out is reachable whenever somebody is standing in the gap. That relay costs the relay nothing and they are never told they did it. 40 characters, one battery per two sends.',
    movable: true,
    reach: (from) => within(from, 1),
    relay: (from) => ringAt(from, 2),
  },
  {
    id: 'BULLETIN', group: 'Telecom methods', label: 'Bulletin board', tag: 'here only',
    blurb: 'Pin a notice at the board you are standing at. Free, no length limit, and it stays there — but only people who walk to that board will ever read it.',
    reach: (from) => [from],
  },
  {
    id: 'LANDLINE', group: 'Telecom methods', label: 'Landline', tag: '4 phones',
    blurb: 'Ring another phone node and whoever is standing there picks up. Free, but one dial per day, and the lines go dead from Day 3.',
    reach: (from) => NODE_IDS.filter((node) => node !== from && MAP_NODES[node].landline),
  },
  {
    id: 'SMS', group: 'Telecom methods', label: 'SMS', tag: 'anywhere',
    blurb: 'Reaches anyone anywhere while the network holds — 20 characters only, and everything past that is silently cut. Dies after Day 2.',
    reach: (from) => NODE_IDS.filter((node) => node !== from),
  },
  {
    id: 'MOBILE_VOICE', group: 'Telecom methods', label: 'Mobile voice', tag: 'Day 1 only',
    blurb: 'A real conversation with anyone, anywhere — on Day 1 only, and half of all calls drop. After that the towers are gone.',
    reach: (from) => NODE_IDS.filter((node) => node !== from),
  },
  {
    id: 'MOBILE_DATA', group: 'Telecom methods', label: 'Mobile data', tag: 'Day 6 only',
    blurb: 'Dead until Day 6, when a cell-on-wheels lights up everything within two roads of the School and of the rendezvous. Both ends have to stand inside it.',
    reach: (from) => within(from, 2),
  },
  {
    id: 'FACE_TO_FACE', group: 'Telecom methods', label: 'Face to face', tag: 'same node',
    blurb: 'Free, unlimited, and the only method that tells you it landed. Everything else you send into the dark.',
    reach: (from) => [from],
  },
  {
    id: 'MESH_STUDENT', group: 'Role abilities', label: 'Mesh · the Student', tag: '2 hops unaided',
    blurb: 'The Student\u2019s mesh carries two roads with nobody in between, so the amber relay ring on Mesh becomes solid reach. It is the one seat that can hold the two halves of the village together on its own — which is also why the Student claims five methods instead of four.',
    reach: (from) => within(from, 2),
  },
  {
    id: 'VO_BROADCAST', group: 'Role abilities', label: 'Village Office broadcaster', tag: 'the Village Leader',
    blurb: 'Not a claimed method — a fixture the Village Leader operates by standing at the Village Office. One push reaches every seat still joined to the Office by road, however far, once a day, 60 characters, one way. After Day 4 it is one of only two places the changed rendezvous is ever spoken; the other is the nightly radio.',
    origin: 'VO',
    reach: (from) => NODE_IDS.filter((node) => node !== from && Number.isFinite(distancesFrom(from)[node])),
  },
  {
    id: 'HIGH_GROUND', group: 'Environment', label: 'High ground', tag: 'sight, not reach',
    sight: true,
    blurb: 'Not a message at all. Standing on the Mountain Shrine 山神廟 — the one high-ground node — you simply see every living player who is out in the open, anywhere on the map, however far away. Anyone inside an enclosed building stays hidden: the Village Office, the Store, the Clinic, the Co-op and the Forest Station. It is passive, so it costs no action and no battery, and the people you spot are never told they were seen.',
    origin: 'SHRINE',
    reach: () => NODE_IDS.filter((node) => node !== 'SHRINE' && MAP_NODES[node].open),
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
  const [method, setMethod] = useState<string>('WALKIE');
  const [vantage, setVantage] = useState<NodeId>(VANTAGE);
  const selected = REACH_SPECS.find((spec) => spec.id === method) ?? REACH_SPECS[0]!;
  const origin = selected.origin ?? vantage;
  const reach = useMemo(() => selected.reach(origin), [selected, origin]);
  const relay = useMemo(() => selected.relay?.(origin) ?? [], [selected, origin]);

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
          You are standing at the {MAP_NODES[origin].label}. Pick a method to see how far it carries.
          {selected.movable
            ? ' Click any node to stand there instead — the reach follows you.'
            : selected.origin === 'SHRINE'
              ? ' This one only works from the high ground, so the map moves you there.'
              : selected.origin
                ? ` This one only works from the ${MAP_NODES[selected.origin].label}, so the map moves you there.`
                : ''}
        </p>
        <div className="reach-explorer">
          <div>
            <div className="reach-picker" role="group" aria-label="Communication methods">
              {REACH_SPECS.map((spec, index) => (
                <Fragment key={spec.id}>
                  {spec.group !== REACH_SPECS[index - 1]?.group && (
                    <p className="reach-group">{spec.group}</p>
                  )}
                  <button
                    aria-pressed={spec.id === method}
                    onClick={() => setMethod(spec.id)}
                    type="button"
                  >
                    <span>{spec.label}</span>
                    <span className="tag">{spec.tag}</span>
                  </button>
                </Fragment>
              ))}
            </div>
            <div className="reach-blurb">
              <p className="card-title">{selected.sight ? 'Sight' : 'Reach'}</p>
              <p>{selected.blurb}</p>
            </div>
          </div>
          <div className="map-frame">
            <VillageMap
              ariaLabel={`Village map showing ${selected.label} reach from the ${MAP_NODES[origin].label}`}
              height={520}
              onNodeClick={selected.movable ? setVantage : undefined}
              reach={reach}
              relay={relay}
              you={origin}
            />
            {selected.movable && (
              // Every clickable node is also a button, so standing somewhere else
              // never depends on hitting a circle with a pointer.
              <div aria-label="Stand at" className="reach-stand" role="group">
                <span className="sig">STAND AT</span>
                {NODE_IDS.map((node) => (
                  <button
                    aria-pressed={node === origin}
                    key={node}
                    onClick={() => setVantage(node)}
                    type="button"
                  >{NODE_SHORT_NAMES[node]}</button>
                ))}
              </div>
            )}
            <div className="map-legend">
              <span className="sig">B bulletin board</span>
              <span className="sig">P landline phone</span>
              <span className="sig">H high ground</span>
              <span className="sig">━ free bridge crossing</span>
              <span className="grn">
                ◌ {selected.sight ? 'a living player here would be visible' : 'reachable on this method'}
              </span>
              {relay.length > 0 && <span className="sig">◌ only if someone relays from between</span>}
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
