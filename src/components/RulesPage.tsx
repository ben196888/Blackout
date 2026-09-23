import { Fragment, lazy, Suspense, useMemo, useState } from 'react';
import {
  compareVersions, defaultRuleVersion, GAME_RULE_VERSION,
  RULE_VERSIONS, rulesUrl, STATUS_LABELS,
} from '../rules/versions';
import { ACTIONS_PER_DAY, DEFAULT_RENDEZVOUS } from '../constants';
import { MAP_NODES, NODE_IDS, distancesFrom } from '../game/map';
import type { NodeId } from '../types';
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
    blurb: 'Every living Walkie-talkie holder within one road hears it, whether you meant them to or not. 40 characters. One battery buys three sends. The Reservist reaches two roads.',
    movable: true,
    reach: (from) => within(from, 1),
  },
  {
    id: 'MESH', group: 'Telecom methods', label: 'Mesh', tag: '1 hop + relay',
    blurb: 'On its own it goes one road, like the walkie. But a third living player standing one road from you and one road from your target passes it on for free — so anyone two roads out is reachable whenever somebody is standing in the gap. The intermediary need not hold Mesh, pays nothing, and is never told they relayed it. 40 characters, one battery per two sends.',
    movable: true,
    reach: (from) => within(from, 1),
    relay: (from) => ringAt(from, 2),
  },
  {
    id: 'BULLETIN', group: 'Telecom methods', label: 'Bulletin board', tag: 'here only',
    blurb: 'Pin a notice at the board you are standing at. Free, no length limit, and it stays there — and living visitors at that board can read it now or later. Posting requires Bulletin; reading does not.',
    origin: 'SCHOOL',
    reach: (from) => [from],
  },
  {
    id: 'LANDLINE', group: 'Telecom methods', label: 'Landline', tag: '4 phones',
    blurb: 'Ring another phone node and living Landline holders standing there receive it. Free, but one dial per day, and the lines go dead from Day 3.',
    origin: 'SCHOOL',
    reach: (from) => NODE_IDS.filter((node) => node !== from && MAP_NODES[node].landline),
  },
  {
    id: 'SMS', group: 'Telecom methods', label: 'SMS', tag: 'anywhere',
    blurb: 'Reaches a living SMS holder anywhere while the network holds. Text beyond 20 characters is cut; your sent record flags truncation, but never confirms remote delivery. Dies after Day 2.',
    reach: (from) => NODE_IDS.filter((node) => node !== from),
  },
  {
    id: 'MOBILE_VOICE', group: 'Telecom methods', label: 'Mobile voice', tag: 'Day 1 only',
    blurb: 'Reaches a living Mobile voice holder anywhere — on Day 1 only, and half of all calls drop. After that the towers are gone.',
    reach: (from) => NODE_IDS.filter((node) => node !== from),
  },
  {
    id: 'MOBILE_DATA', group: 'Telecom methods', label: 'Mobile data', tag: 'Day 6 only',
    blurb: 'Day 6 only. Both holders must stand within two roads of School or the true rendezvous; they can be in different zones. This preview shows only the School zone. The second zone depends on the Night 4 rendezvous.',
    origin: 'SCHOOL',
    reach: (from) => within(from, 2),
  },
  {
    id: 'FACE_TO_FACE', group: 'Telecom methods', label: 'Face to face', tag: 'same node',
    blurb: 'Free, unlimited, needs no selected method, and the only method that confirms delivery and a recipient count. Everything else you send into the dark.',
    reach: (from) => [from],
  },
  {
    id: 'MESH_STUDENT', group: 'Role abilities', label: 'Mesh · the Student', tag: '2 hops unaided',
    blurb: 'The Student\u2019s mesh carries two roads with nobody in between, so the amber relay ring on Mesh becomes solid reach. It is the one seat that can hold the two halves of the village together on its own — which is also why the Student claims five methods instead of four.',
    reach: (from) => within(from, 2),
  },
  {
    id: 'VO_BROADCAST', group: 'Role abilities', label: 'Village Office broadcaster', tag: 'the Village Leader',
    blurb: 'Not a claimed method — a fixture the Village Leader operates by standing at the Village Office. One free push reaches every other living survivor still joined to the Office by road, regardless of selected methods, once a day, 60 characters, one way. The Leader writes the message; it does not automatically announce the rendezvous. The official Night 4 announcement goes to radio listeners and the Office bulletin board.',
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
  { day: 3, event: 'Bridge span severed', detail: 'Without repairs, the village splits · SMS and landline die · exposure night', tone: 'var(--danger)' },
  { day: 4, event: 'Official rendezvous changes', detail: 'After Night 4 food/deaths: radio listeners and Office board receive it', tone: 'var(--signal)' },
  { day: 5, event: 'Power scarcity', detail: 'Mesh/Walkie charges double · radio stays 1 battery · exposure night', tone: 'var(--danger)' },
  { day: 6, event: 'Cell-on-wheels online', detail: 'Mobile data, two roads out, for one day', tone: 'var(--fresh)' },
  { day: 7, event: 'Final convergence', detail: 'Survivors’ locations are scored after Night 7', tone: 'var(--signal)' },
];

const PHASES = [
  { n: '01', tone: '', title: 'Day 0 — Plan', body: 'Everyone picks exactly four methods (the Student gets five) and writes one shared comms plan. Choices are public. After this, no renegotiation.' },
  { n: '02', tone: 'move', title: 'Move', body: `${ACTIONS_PER_DAY} actions a day. Walk one road, scavenge a cache, or pair up with someone at your node to clear a severed road.` },
  { n: '03', tone: 'move', title: 'Contact', body: 'Direct electronic messages require both sides to hold the method. Face-to-face needs no selection; Bulletin readers and Mesh intermediaries need not hold those methods. Only face-to-face confirms delivery.' },
  { n: '04', tone: 'night', title: 'Night', body: 'Consume one food, or two in the open on Nights 2, 3 and 5. Zero food remaining afterward counts as starvation, even if you could afford the meal. Two consecutive such nights cause death.' },
];

const Rulebook = lazy(() => import('./Rulebook'));
const DraftReachExplorer = lazy(() => import('./DraftReachExplorer'));

export function RulesPage() {
  const requested = new URLSearchParams(window.location.search).get('version');
  const defaultVersion = defaultRuleVersion();
  const selected = RULE_VERSIONS.find(({ version }) => `v${version}` === requested) ?? defaultVersion;
  return (
    <>
      <section className="rules-version" aria-label="Rulebook selection">
        <div className="rules-version-controls">
          <label htmlFor="rules-version">Rule version</label>
          <select id="rules-version" value={selected.version}
            onChange={(event) => window.location.assign(rulesUrl(event.target.value))}>
            {[...RULE_VERSIONS].sort(compareVersions).reverse().map(({ version, status }) => (
              <option key={version} value={version}>
                v{version} · {STATUS_LABELS[status]}{version === GAME_RULE_VERSION ? ' · In play' : ''}
              </option>
            ))}
          </select>
        </div>
        {requested && !RULE_VERSIONS.some(({ version }) => `v${version}` === requested) && (
          <p role="status">That rule version is unavailable. Showing the default version.</p>
        )}

      </section>
      {['0.0.1', '0.0.2'].includes(selected.version) ? <VersionedRules version={selected.version} /> : (
        <main className="rules">
          <header className="rules-hero">
            <div>
              <p className="kicker">RULES v{selected.version} · {STATUS_LABELS[selected.status].toUpperCase()}</p>
              <h1>BLACKOUT</h1>
            </div>
          </header>
          <Suspense fallback={<p className="rules-section">Loading rulebook…</p>}>
            <Rulebook version={selected.version} />
          </Suspense>
          <section className="rules-section"><a href="/">← Back to the lobby</a></section>
        </main>
      )}
    </>
  );
}

function VersionedRules({ version }: { version: string }) {
  const draft = version === '0.0.2';
  const [showRulebook, setShowRulebook] = useState(false);
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
          <p className="kicker">RULES v{version} · {draft ? '4–20 PLAYERS' : 'FOUR SEATS'} · SEVEN NIGHTS</p>
          <h1>BLACKOUT</h1>
          <p>
            {draft ? 'Four to twenty survivors are scattered across a Village, Town or Valley after a blackout.'
              : 'Four survivors are scattered across a village after a blackout.'} Each has private
            information, a private inventory, and a limited set of ways to reach the others. You
            spend Day 0 negotiating who covers which method, then live with those choices for seven
            nights.
          </p>
        </div>
        <TrialNotice />
      </header>

      <section className="rules-section" id="food-exposure-and-death">
        <h2>01 · How a day runs</h2>
        <div className="day-cards">
          {PHASES.map((phase) => (
            <article className={`day-card ${phase.tone}`} key={phase.n}>
              <div className="num">{phase.n}</div>
              <h3>{phase.title}</h3>
              <p>{draft && phase.n === '01' ? 'Choose attendance and its matching map. Everyone picks four methods (the Student gets five), then agrees on one shared comms plan. Choices lock before Day 1.'
                : draft && phase.n === '03' ? 'Direct electronic messages require both sides to hold the method. Face-to-face needs no selection; Bulletin readers need no Bulletin selection. Mesh relays require a living holder equipped with Mesh. Only face-to-face confirms delivery.'
                  : phase.body}</p>
            </article>
          ))}
        </div>
        <p className="sub">
          Food never falls below zero. Finishing a night with food remaining resets the starvation
          streak. For example, starting a normal night with exactly one food leaves zero and counts
          as a starvation night. A Nurse sharing a node with another survivor alive at the start of
          the night consumes one less food, to a minimum of zero; only the Nurse benefits.
        </p>
      </section>

      <section className="rules-section">
        <h2>02 · Who can you actually reach</h2>
        {draft ? (
          <Suspense fallback={<p className="sub">Loading map explorer…</p>}>
            <DraftReachExplorer methods={REACH_SPECS} />
          </Suspense>
        ) : <>
        <p className="sub">
          You are standing at the {MAP_NODES[origin].label}. Pick a method to see how far it carries.
          {selected.movable
            ? ' Click any node to stand there instead — the reach follows you.'
            : selected.origin === 'SHRINE'
              ? ' This one only works from the high ground, so the map moves you there.'
              : selected.origin
                ? ` This example starts at the ${MAP_NODES[selected.origin].label}, so the map moves you there.`
                : ''}
        </p>
        <p className="sub">
          This preview shows potential reach on the intact map. In play, road closures, the day’s
          network availability, selected methods and living recipients determine delivery. Road
          distance counts the intact bridge as zero; high-ground sight ignores road closures.
        </p>
        <div className="reach-explorer">
          <div>
            <div className="reach-picker" role="group" aria-label="Ways to reach and see">
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
        </>}

      </section>

      <section className="rules-section">
        <h2>03 · Quick reference — seven methods + face-to-face</h2>
        <p className="sub">
          Both ends must hold a direct electronic method. Face-to-face is always available at the
          same node. Bulletin requires a selection to post, but not to read; a Mesh intermediary
          {draft ? ' must hold Mesh in this draft.' : ' needs no Mesh selection.'} Costs below are normal daily rates: on Day 5, Mesh and Walkie
          send charges double; free methods stay free and nightly radio still costs one battery.
          Capped messages flag truncation in your sent record, without revealing remote delivery.
        </p>
        <div className="ref-table ref-scroll">
          <table>
            <thead>
              <tr><th>Method</th><th>Reach</th><th>Cap</th><th>Battery</th><th>Goes down</th></tr>
            </thead>
            <tbody>
              {METHOD_TABLE.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td><td>{draft && row.name === 'Landline' ? '4–6 phone nodes, by map' : draft && row.name === 'Walkie-talkie' ? 'Same neighborhood + sender’s border neighbors; Reservist +1 road' : draft && row.name === 'Mesh' ? 'Same neighborhood + sender’s border neighbors + one equipped relay; high-ground links; Student +1 road' : row.reach}</td><td>{row.cap}</td><td>{row.batt}</td><td>{row.down}</td>
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
                <span className="detail">{draft && entry.day === 2 ? 'Forest Station–Co-op closes · exposure night · voice gone'
                  : draft && entry.day === 3 ? 'Office–School closes · alternative routes stay open · SMS and landline die · exposure night'
                    : entry.detail}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2>05 · How it ends</h2>
          <div className="scoring">
            <div><span className="stars">★★★</span><p>All {draft ? 'players' : 'four'} alive and standing on the true rendezvous after night 7.</p></div>
            <div><span className="stars">★★</span><p>All {draft ? 'players' : 'four'} alive, but not everyone made the rendezvous.</p></div>
            <div><span className="stars">★</span><p>At least one survivor, but somebody died.</p></div>
            <div><span className="stars none">—</span><p style={{ color: 'var(--danger)' }}>Nobody left. The match ends at the night resolution when the last survivor dies.</p></div>
            <span className="footnote">
              The rendezvous starts at the {MAP_NODES[DEFAULT_RENDEZVOUS].label} and changes on
              Night 4 after food and deaths resolve.{draft && ' The new destination is Temple or Barn; everyone shares one destination with no occupancy limit.'} That night, successful radio listeners learn
              it privately and an official notice appears on the Village Office board. Survivors
              can relay the news. Choose radio listening during Contact: each successful listen
              costs one battery, including Night 5. Other nights carry no new announcement but
              still charge; dead survivors and listeners without a battery are not charged.
            </span>
          </div>
        </div>
      </section>

      {draft && <section className="rules-section">
        <h2>06 · Bigger groups, broader maps</h2>
        <div className="day-cards draft-scale-cards">
          <article className="day-card"><div className="num">4–8</div><h3>Village</h3><p>18 locations · 26 roads · 4 neighborhoods. A compact settlement with several crossings and local loops.</p></article>
          <article className="day-card move"><div className="num">9–13</div><h3>Town</h3><p>28 locations · 46 roads · 6 neighborhoods. Riverside and Works create additional supply routes and meeting places.</p></article>
          <article className="day-card night"><div className="num">14–20</div><h3>Valley</h3><p>40 locations · 72 roads · 8 neighborhoods. Upland and South Settlement spread the group across connected communities.</p></article>
        </div>
        <p className="sub">Cache six food and three batteries per player across the map. Starting inventories,
          carrying limits and daily actions stay the same. Deal one Village Leader, then repeated shuffled
          decks of the other professions. Start at distinct locations distributed across neighborhoods.</p>
        <p className="sub">School and Barn are enclosed in this version. Observation is local to the designated
          Lookout, Quarry and Observatory areas; the Shrine loses global sight. Office broadcasts reach
          Core, School and Ridge. Ordinary sightlines and an absent-player policy are still under review.</p>
        <details className="draft-rulebook-details" onToggle={(event) => setShowRulebook(event.currentTarget.open)}>
          <summary>Complete v0.0.2 proposal and map data</summary>
          {showRulebook && <Suspense fallback={<p>Loading rulebook…</p>}><Rulebook version={version} /></Suspense>}
        </details>
      </section>}

      <section className="rules-section">
        <a className="hud-link" href="/">← Back to the lobby</a>
      </section>
    </main>
  );
}
