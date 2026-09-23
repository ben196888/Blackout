import { Fragment, useMemo, useState } from 'react';
import { DRAFT_MAPS, draftReach, mapNodes, observationSites, roadKey } from '../rules/draft-map';

const diagrams = import.meta.glob<string>('../../docs/rules/diagrams/v0.0.2/*.svg', {
  query: '?raw', import: 'default', eager: true,
});

/** Reuse the reviewed diagram geometry; topology and reach still come from the map JSON. */
function diagramGeometry(id: string) {
  const svg = new DOMParser().parseFromString(diagrams[`../../docs/rules/diagrams/v0.0.2/${id}.svg`]!, 'image/svg+xml');
  const graph = svg.querySelector('g.graph')!;
  const translation = graph.getAttribute('transform')!.match(/translate\(([-\d.]+) ([-\d.]+)\)/)!;
  const [, , width, height] = svg.documentElement.getAttribute('viewBox')!.split(' ').map(Number);
  const groups = (kind: string) => [...graph.querySelectorAll(`g.${kind}`)].map((group) => ({
    id: group.querySelector('title')!.textContent!,
    paths: [...group.querySelectorAll('path:not(.road-casing)')].map((path) => path.getAttribute('d')!),
    labels: [...group.querySelectorAll('text')].map((text) => ({
      x: Number(text.getAttribute('x')), y: Number(text.getAttribute('y')), text: text.textContent!,
    })),
  }));
  return { viewBox: [-Number(translation[1]), -Number(translation[2]), width!, height!],
    nodes: groups('node'), edges: groups('edge'), regions: groups('cluster') };
}

type Method = { id: string; group: string; label: string; tag: string; blurb: string };
const BLURBS: Record<string, string> = {
  WALKIE: 'Every living Walkie-talkie holder in your neighborhood, plus holders at locations directly connected to your location across its boundary, hears the broadcast. Barn reaches all of Farm, Field and Quarry. A closed road does not stop radio coverage. 40 characters; one battery buys three sends.',
  WALKIE_RESERVIST: 'A Reservist reaches the ordinary Walkie-talkie footprint plus every location one road beyond it. The extra road is measured from any location in the ordinary footprint. Closed roads do not block radio coverage; listeners still need Walkie-talkie.',
  MESH: 'Address one Mesh holder in your neighborhood or at a node connected across its boundary. An equipped holder in direct range can relay once, automatically and privately. Lookout links to Field; Town adds Quarry–Dock, Valley adds Observatory–Shelter. These radio links need a holder at each end and remain open when roads close. 40 characters; one battery buys two sends.',
  MESH_STUDENT: 'The Student sends Mesh one additional road beyond ordinary direct coverage without a relay. A relay still uses its own ordinary range. The Student chooses five methods; other professions choose four.',
  VO_BROADCAST: 'From Village Office, the Village Leader reaches living survivors in Core, School and Ridge only. One free, player-written message per day, 60 characters, with no delivery receipt. Other neighborhoods need relays or boards.',
  HIGH_GROUND: 'Lookout sees open locations in Ridge and Farm. Town adds Quarry overlooking Ridge and Works; Valley adds Observatory overlooking Upland and Core. Enclosed locations stay hidden. This is passive sight, not a message. Shrine no longer provides global observation.',
};

export default function DraftReachExplorer({ methods }: { methods: readonly Method[] }) {
  const previewMethods = methods.flatMap((entry) => {
    if (entry.id === 'WALKIE') return [{ ...entry, tag: 'zone + border' }];
    if (entry.id === 'MESH') return [{ ...entry, tag: 'zone + border + relay' }];
    if (entry.id === 'MESH_STUDENT') return [{
      id: 'WALKIE_RESERVIST', group: 'Role abilities', label: 'Walkie-talkie · Reservist',
      tag: 'zone + border + 1 road', blurb: BLURBS.WALKIE_RESERVIST,
    }, { ...entry, tag: 'direct + 1 road' }];
    return [entry];
  });
  const [scale, setScale] = useState('village');
  const [method, setMethod] = useState('WALKIE');
  const [vantage, setVantage] = useState('SCHOOL');
  const [observation, setObservation] = useState('LOOKOUT');
  const [closures, setClosures] = useState(0);
  const [focus, setFocus] = useState('all');
  const [zoom, setZoom] = useState(1);
  const map = DRAFT_MAPS.find(({ id }) => id === scale)!;
  const geometry = useMemo(() => diagramGeometry(scale), [scale]);
  const names = Object.fromEntries(geometry.nodes.map((node) => [node.id, node.labels.map(({ text }) => text).join(' ')]));
  const selected = previewMethods.find(({ id }) => id === method)!;
  const pinned = ['BULLETIN', 'LANDLINE', 'MOBILE_DATA'].includes(method) ? 'SCHOOL'
    : method === 'VO_BROADCAST' ? 'VO' : method === 'HIGH_GROUND' ? observation : undefined;
  const origin = pinned ?? vantage;
  const { reach, relay } = draftReach(map, method, origin, closures);
  const nodes = mapNodes(map);
  const title = scale[0]!.toUpperCase() + scale.slice(1);
  const closed = map.closures.slice(0, closures).map(([a, b]) => roadKey(a!, b!));
  const region = map.regions.find(({ nodes }) => nodes.includes(origin))!;
  const focused = geometry.regions.find(({ id }) => id === `cluster_${focus}`);
  let viewBox = geometry.viewBox;
  if (focused) {
    const points = focused.paths[0]!.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    const xs = points.filter((_, index) => index % 2 === 0);
    const ys = points.filter((_, index) => index % 2 === 1);
    viewBox = [Math.min(...xs) - 20, Math.min(...ys) - 20, Math.max(...xs) - Math.min(...xs) + 40, Math.max(...ys) - Math.min(...ys) + 40];
  }
  const chooseNode = (node: string) => {
    if (!pinned) setVantage(node);
    else if (method === 'HIGH_GROUND' && observationSites(map).includes(node)) setObservation(node);
    if (focus !== 'all') setFocus(map.regions.find(({ nodes }) => nodes.includes(node))!.id);
  };
  return (
    <>
      <div className="draft-map-controls">
        <label>Map scale<select aria-label="Map scale" value={scale} onChange={(event) => {
          setScale(event.target.value); setVantage('SCHOOL'); setObservation('LOOKOUT'); setFocus('all'); setZoom(1);
        }}>{DRAFT_MAPS.map((entry) => <option key={entry.id} value={entry.id}>
          {entry.id[0]!.toUpperCase() + entry.id.slice(1)} · {entry.players[0]}–{entry.players[1]} players
        </option>)}</select></label>
        <label>Road conditions<select aria-label="Road conditions" value={closures} onChange={(event) => setClosures(Number(event.target.value))}>
          <option value={0}>Intact roads</option><option value={1}>Day 2 closure</option><option value={2}>Both closures · Day 3 onward</option>
        </select></label>
      </div>
      <p className="sub">{title}: {nodes.length} locations, {map.edges.length} roads, {map.regions.length} neighborhoods.
        {' '}Every road costs one move. Closures create detours; the map stays connected.</p>
      <p className="sub">You are standing at the {names[origin]}. {pinned
        ? 'This method starts at a suitable facility.' : 'Click a location or choose one below to move the preview.'}
        {' '}Highlights show potential reach, not delivery. Network timing, method selection and living recipients still apply.</p>
      <div className="reach-explorer">
        <div>
          <div className="reach-picker" role="group" aria-label="Ways to reach and see">
            {previewMethods.map((spec, index) => <Fragment key={spec.id}>
              {spec.group !== previewMethods[index - 1]?.group && <p className="reach-group">{spec.group}</p>}
              <button type="button" aria-pressed={spec.id === method} onClick={() => { setMethod(spec.id); setFocus('all'); }}>
                <span>{spec.label}</span><span className="tag">{spec.id === 'LANDLINE' ? `${map.landlines.length} phones` : spec.tag}</span>
              </button>
            </Fragment>)}
          </div>
          <div className="reach-blurb"><p className="card-title">{method === 'HIGH_GROUND' ? 'Sight' : 'Reach'}</p>
            <p>{BLURBS[method] ?? selected.blurb}</p></div>
        </div>
        <div className="map-frame">
          <div className="draft-map-controls">
            <label>Neighborhood focus<select aria-label="Neighborhood focus" value={focus} onChange={(event) => { setFocus(event.target.value); setZoom(1); }}>
              <option value="all">Whole map</option>{geometry.regions.map((region) => <option key={region.id} value={region.id.replace('cluster_', '')}>{region.labels[0]!.text}</option>)}
            </select></label>
            <label>Map zoom<select aria-label="Map zoom" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>
              <option value={1}>Fit</option><option value={1.5}>150%</option><option value={2}>200%</option><option value={3}>300%</option>
            </select></label>
          </div>
          <p className="draft-map-hint">Focus a neighborhood or zoom in for larger labels. Scroll to explore a zoomed map.</p>
          <div className="draft-map-scroll" tabIndex={0} aria-label="Scrollable map">
            <svg className="draft-map" data-fit={zoom === 1} role="group" aria-label={`${title} map showing ${selected.label} reach from the ${names[origin]}`}
              viewBox={viewBox.join(' ')} style={{ width: `${zoom * 100}%` }}>
              {geometry.regions.map((region, index) => <g className={`draft-region region-${index}`} key={region.id}>
                {region.paths.map((path, i) => <path key={i} d={path} />)}
              </g>)}
              {geometry.edges.map((edge) => <g className="draft-road" data-adjacent={edge.id.split('--').includes(origin)} data-closed={closed.includes(roadKey(...edge.id.split('--') as [string, string]))} key={edge.id}>
                <title>{edge.id.replace('--', ' to ')}{closed.includes(roadKey(...edge.id.split('--') as [string, string])) ? ' · closed' : ''}</title>
                {edge.paths.map((path, i) => <Fragment key={i}>
                  <path className="road-casing" d={path} />
                  <path className="road-line" d={path} />
                </Fragment>)}
              </g>)}
              {geometry.regions.map((region) => <g className="draft-region-label" key={region.id}>
                {region.labels.map((label, i) => <text key={i} x={label.x} y={label.y}>{label.text}</text>)}
              </g>)}
              {geometry.nodes.map((node) => {
                const inView = focus === 'all' || map.regions.find(({ id }) => id === focus)!.nodes.includes(node.id);
                const interactive = inView && (!pinned || (method === 'HIGH_GROUND' && observationSites(map).includes(node.id)));
                return <g key={node.id} className="draft-map-node" data-node={node.id} data-selected={node.id === origin}
                  data-reach={reach.includes(node.id) ? 'direct' : relay.includes(node.id) ? 'relay' : 'none'}
                  role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined}
                  aria-label={interactive ? `Stand at ${names[node.id]}` : undefined} aria-pressed={interactive ? node.id === origin : undefined}
                  onClick={() => chooseNode(node.id)} onKeyDown={(event) => {
                    if (interactive && ['Enter', ' '].includes(event.key)) { event.preventDefault(); chooseNode(node.id); }
                  }}>
                  <title>{names[node.id]} · {map.enclosed.includes(node.id) ? 'enclosed' : 'open'}{map.rendezvousCandidates.includes(node.id) ? ' · evacuation candidate' : ''}</title>
                  {node.paths.map((path, i) => <path key={i} d={path} />)}
                  {node.labels.map((label, i) => <text key={i} x={label.x} y={label.y}>{label.text}</text>)}
                </g>;
              })}
            </svg>
          </div>
          <div className="draft-map-controls">
            <label>{method === 'HIGH_GROUND' ? 'Observation site' : 'Stand at'}
              <select aria-label={method === 'HIGH_GROUND' ? 'Observation site' : 'Stand at'} value={origin} disabled={Boolean(pinned) && method !== 'HIGH_GROUND'} onChange={(event) => chooseNode(event.target.value)}>
                {(method === 'HIGH_GROUND' ? observationSites(map) : nodes).map((node) => <option key={node} value={node}>{names[node]}</option>)}
              </select>
            </label>
            <p className="draft-node-detail" aria-live="polite">{names[origin]} · {region.id} · {map.enclosed.includes(origin) ? 'Enclosed' : 'Open'}
              {map.bulletins.includes(origin) ? ' · Bulletin board' : ''}{map.landlines.includes(origin) ? ' · Phone' : ''}
              {map.rendezvousCandidates.includes(origin) ? ' · Evacuation candidate' : ''}
              {['MESH', 'MESH_STUDENT'].includes(method) && map.meshHighGroundLinks.some(([site]) => site === origin) ? ' · Mesh high ground' : ''}</p>
          </div>
          <div className="map-legend">
            <span className="grn">Green border: {method === 'HIGH_GROUND' ? 'visible open location' : 'reachable'}</span>
            <span className="grn">Green fill: you</span>
            {relay.length > 0 && <span className="sig">Amber dashed border: possible via one Mesh-equipped intermediary</span>}
            <span>Double border: evacuation candidate</span><span>Red dashed road: closed</span>
            <span className="grn">Bright roads: exits from your location</span>
            <span>Gaps separate crossing roads. Only named locations are junctions.</span>
          </div>
        </div>
      </div>
    </>
  );
}
