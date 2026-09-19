/** Deterministic, dependency-free map layout. Run with Node 24 via `pnpm maps:layout`. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Point = [number, number];
export interface MapSpec {
  id: string;
  players: number[];
  regions: { id: string; nodes: string[] }[];
  edges: string[][];
  closures: string[][];
  rendezvousCandidates: string[];
}
export interface LayoutConfig {
  seed: number; restarts: number; iterations: number; nodeWidth: number; nodeHeight: number;
  labels: Record<string, string>;
  regions: Record<string, { label: string; color: string }>;
  centers: Record<string, Record<string, Point>>;
  initialPositions?: Record<string, Positions>;
}
export type Positions = Record<string, Point>;
const EPSILON = 1e-7;
const round = (n: number) => Math.round(n * 100) / 100;
const nodeWidth = (node: string, config: LayoutConfig) => Math.min(config.nodeWidth, Math.max(58, config.labels[node]!.length * 7.7 + 20));
const orient = (a: Point, b: Point, c: Point) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/** Counts proper crossings and positive-length collinear overlaps, but not endpoint touches. */
export function roadsOverlap([a, b]: [Point, Point], [c, d]: [Point, Point]): boolean {
  const ac = orient(a, b, c), ad = orient(a, b, d), ca = orient(c, d, a), cb = orient(c, d, b);
  if (ac * ad < -EPSILON && ca * cb < -EPSILON) return true;
  if ([ac, ad, ca, cb].every((n) => Math.abs(n) < EPSILON)) {
    const axis = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]) ? 0 : 1;
    return Math.min(Math.max(a[axis], b[axis]), Math.max(c[axis], d[axis]))
      - Math.max(Math.min(a[axis], b[axis]), Math.min(c[axis], d[axis])) > EPSILON;
  }
  return false;
}

/** Clip to node borders, exactly as rendered. Shared endpoint boxes are not road crossings. */
export function roadSegment(edge: string[], positions: Positions, config: LayoutConfig): [Point, Point] {
  const a = positions[edge[0]!]!, b = positions[edge[1]!]!;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const ta = Math.min((nodeWidth(edge[0]!, config) / 2 + 4) / Math.abs(dx), (config.nodeHeight / 2 + 4) / Math.abs(dy));
  const tb = Math.min((nodeWidth(edge[1]!, config) / 2 + 4) / Math.abs(dx), (config.nodeHeight / 2 + 4) / Math.abs(dy));
  return [[round(a[0] + dx * ta), round(a[1] + dy * ta)], [round(b[0] - dx * tb), round(b[1] - dy * tb)]];
}

function hitsBox([a, b]: [Point, Point], center: Point, width: number, height: number): boolean {
  let low = 0, high = 1;
  for (const axis of [0, 1] as const) {
    const half = (axis === 0 ? width : height) / 2;
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < EPSILON) {
      if (a[axis] <= center[axis] - half || a[axis] >= center[axis] + half) return false;
    } else {
      const x = (center[axis] - half - a[axis]) / delta, y = (center[axis] + half - a[axis]) / delta;
      low = Math.max(low, Math.min(x, y)); high = Math.min(high, Math.max(x, y));
    }
  }
  return high - low > EPSILON;
}

export function auditLayout(map: MapSpec, positions: Positions, config: LayoutConfig) {
  const nodes = map.regions.flatMap((region) => region.nodes);
  const owners = Object.fromEntries(map.regions.flatMap((region) => region.nodes.map((node) => [node, region.id])));
  const segments = map.edges.map((edge) => roadSegment(edge, positions, config));
  const crossingPairs: { edges: string[][]; kind: 'cross-zone' | 'within-zone' }[] = [];
  let nodeObstructions = 0, nodeOverlaps = 0;
  for (const [i, edge] of map.edges.entries()) {
    for (const node of nodes) if (!edge.includes(node) && hitsBox(segments[i]!, positions[node]!, nodeWidth(node, config) + 8, config.nodeHeight + 8)) nodeObstructions++;
    for (let j = i + 1; j < map.edges.length; j++) {
      if (!roadsOverlap(segments[i]!, segments[j]!)) continue;
      const other = map.edges[j]!;
      const cross = owners[edge[0]!] !== owners[edge[1]!] && owners[other[0]!] !== owners[other[1]!];
      crossingPairs.push({ edges: [edge, other], kind: cross ? 'cross-zone' : 'within-zone' });
    }
  }
  for (const [i, a] of nodes.entries()) for (const b of nodes.slice(i + 1)) {
    if (Math.abs(positions[a]![0] - positions[b]![0]) < (nodeWidth(a, config) + nodeWidth(b, config)) / 2 + 12
      && Math.abs(positions[a]![1] - positions[b]![1]) < config.nodeHeight + 12) nodeOverlaps++;
  }
  return {
    crossZoneCrossings: crossingPairs.filter(({ kind }) => kind === 'cross-zone').length,
    withinZoneCrossings: crossingPairs.filter(({ kind }) => kind === 'within-zone').length,
    nodeObstructions, nodeOverlaps, crossingPairs,
  };
}

/** One cross-zone crossing outweighs ALL local crossings; node collisions are invalid. */
export function layoutCost(audit: ReturnType<typeof auditLayout>, edgeCount: number): number {
  const base = edgeCount * (edgeCount - 1) / 2 + 1;
  return (audit.nodeObstructions + audit.nodeOverlaps) * base * base
    + audit.crossZoneCrossings * base + audit.withinZoneCrossings;
}

export function optimizeLayout(map: MapSpec, config: LayoutConfig): Positions {
  const ids = map.regions.flatMap((region) => region.nodes);
  const owners = Object.fromEntries(map.regions.flatMap((region) => region.nodes.map((node) => [node, region.id])));
  const base = map.edges.length * (map.edges.length - 1) / 2 + 1;
  let seed = config.seed;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  let bestCost = Infinity, best: Positions = {};
  // Cache each term's dependencies so swaps only reevaluate affected geometry.
  const terms: { nodes: string[]; cost: (p: Positions, segments: [Point, Point][]) => number }[] = [];
  for (const [i, edge] of map.edges.entries()) {
    for (const node of ids) if (!edge.includes(node)) terms.push({ nodes: [...edge, node],
      cost: (p, segments) => hitsBox(segments[i]!, p[node]!, nodeWidth(node, config) + 8, config.nodeHeight + 8) ? base * base : 0 });
    for (let j = i + 1; j < map.edges.length; j++) {
      const other = map.edges[j]!;
      const cross = owners[edge[0]!] !== owners[edge[1]!] && owners[other[0]!] !== owners[other[1]!];
      terms.push({ nodes: [...edge, ...other], cost: (_, segments) => roadsOverlap(segments[i]!, segments[j]!) ? (cross ? base : 1) : 0 });
    }
  }
  for (const [i, a] of ids.entries()) for (const b of ids.slice(i + 1)) terms.push({ nodes: [a, b],
    cost: (p) => Math.abs(p[a]![0] - p[b]![0]) < (nodeWidth(a, config) + nodeWidth(b, config)) / 2 + 12
      && Math.abs(p[a]![1] - p[b]![1]) < config.nodeHeight + 12 ? base * base : 0 });
  // Swap endpoint ordering and nudge nodes inside their authored neighborhood boundary.
  const swaps = map.regions.flatMap((region) => region.nodes.flatMap((a, i) => region.nodes.slice(i + 1).map((b) => ({
    a, b, terms: terms.filter((term) => term.nodes.includes(a) || term.nodes.includes(b)),
  }))));
  const search = (positions: Positions, steps: number, localOnly = false) => {
    let segments = map.edges.map((edge) => roadSegment(edge, positions, config));
    let cost = terms.reduce((sum, term) => sum + term.cost(positions, segments), 0);
    const remember = () => {
      if (cost < bestCost) { bestCost = cost; best = structuredClone(positions); }
    };
    remember();
    for (let step = 0; step < steps && bestCost > 0; step++) {
      const swap = swaps[Math.floor(random() * swaps.length)]!;
      const before = swap.terms.reduce((sum, term) => sum + term.cost(positions, segments), 0);
      const oldA = positions[swap.a]!, oldB = positions[swap.b]!;
      if (random() < .55) [positions[swap.a], positions[swap.b]] = [oldB, oldA];
      else {
        const [cx, cy] = config.centers[map.id]![owners[swap.a]!]!;
        positions[swap.a] = [Math.max(cx - 155, Math.min(cx + 155, oldA[0] + (random() - .5) * (localOnly ? 30 : 80))),
          Math.max(cy - 108, Math.min(cy + 108, oldA[1] + (random() - .5) * (localOnly ? 24 : 60)))];
      }
      positions[swap.a] = positions[swap.a]!.map(round) as Point;
      const nextSegments = map.edges.map((edge) => roadSegment(edge, positions, config));
      const after = swap.terms.reduce((sum, term) => sum + term.cost(positions, nextSegments), 0);
      const temperature = Math.max(.01, (localOnly ? 1.5 : base) * (1 - step / steps) ** 3);
      const preservesPriority = !localOnly || Math.floor((cost + after - before) / base) <= Math.floor(bestCost / base);
      if (preservesPriority && (after <= before || random() < Math.exp((before - after) / temperature))) {
        cost += after - before; segments = nextSegments; remember();
      } else [positions[swap.a], positions[swap.b]] = [oldA, oldB];
    }
  };
  for (let restart = 0; restart < config.restarts && bestCost > 0; restart++) {
    const positions: Positions = {};
    for (const region of map.regions) {
      const rotation = restart === 0 ? 0 : random() * Math.PI * 2;
      const [cx, cy] = config.centers[map.id]![region.id]!;
      region.nodes.forEach((node, index) => {
        const angle = 2 * Math.PI * index / region.nodes.length + rotation;
        positions[node] = [round(cx + 140 * Math.cos(angle)), round(cy + 105 * Math.sin(angle))];
      });
    }
    if (restart === 0 && config.initialPositions?.[map.id]) Object.assign(positions, structuredClone(config.initialPositions[map.id]));
    if (auditLayout(map, positions, config).nodeOverlaps) continue;
    search(positions, config.iterations);
  }
  if (bestCost > 0 && Object.keys(best).length) search(structuredClone(best), config.iterations * 3, true);
  if (!Object.keys(best).length) throw new Error(`No non-overlapping node slots for ${map.id}`);
  return Object.fromEntries(Object.entries(best).map(([id, p]) => [id, p.map((n) => Math.round(n * 100) / 100) as Point]));
}

const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const rectangle = (x: number, y: number, width: number, height: number) => `M${x},${y} L${x + width},${y} L${x + width},${y + height} L${x},${y + height} Z`;
export function renderMap(map: MapSpec, positions: Positions, config: LayoutConfig): string {
  const centers = Object.values(config.centers[map.id]!);
  const x0 = Math.min(...centers.map(([x]) => x)) - 252, y0 = Math.min(...centers.map(([, y]) => y)) - 260;
  const width = Math.max(...centers.map(([x]) => x)) - x0 + 252, height = Math.max(...centers.map(([, y]) => y)) - y0 + 190;
  const regionLabels: string[] = [];
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">`,
    '<!-- Generated by pnpm maps:layout. Edit map-layout.config.json or the canonical map JSON. -->',
    `<g class="graph" transform="translate(${-x0} ${-y0})">`,
    `<text x="${x0 + width / 2}" y="${y0 + 36}" text-anchor="middle" font-family="Arial" font-size="24">${map.id[0]!.toUpperCase() + map.id.slice(1)} · ${map.players.join('–')} players</text>`,
    `<text x="${x0 + width / 2}" y="${y0 + 66}" text-anchor="middle" font-family="Arial" font-size="18">${Object.keys(positions).length} locations · ${map.edges.length} roads</text>`];
  for (const region of map.regions) {
    const [cx, cy] = config.centers[map.id]![region.id]!;
    const { color, label } = config.regions[region.id]!;
    const text = `<text x="${cx}" y="${cy - 148}" text-anchor="middle" font-family="Arial" font-size="17" fill="#334155" paint-order="stroke" stroke="${color}" stroke-width="5">${escape(label)}</text>`;
    out.push(`<g class="cluster"><title>cluster_${region.id}</title><path d="${rectangle(cx - 236, cy - 174, 472, 336)}" fill="${color}" stroke="#cbd5e1"/>${text}</g>`);
    regionLabels.push(text);
  }
  for (const edge of map.edges) {
    const [a, b] = roadSegment(edge, positions, config);
    const path = `M${a.map((n) => n.toFixed(2)).join(',')} L${b.map((n) => n.toFixed(2)).join(',')}`;
    const closure = map.closures.findIndex((pair) => pair.every((node) => edge.includes(node)));
    out.push(`<g class="edge"><title>${edge.join('--')}</title>`,
      `<path class="road-casing" d="${path}" fill="none" stroke="white" stroke-width="7"/>`,
      `<path class="road-line" d="${path}" fill="none" stroke="${closure >= 0 ? '#be123c' : '#64748b'}" stroke-width="2"${closure >= 0 ? ' stroke-dasharray="8 5"' : ''}/>`);
    if (closure >= 0) out.push(`<text x="${(a[0] + b[0]) / 2}" y="${(a[1] + b[1]) / 2 - 8}" font-family="Arial" font-size="12" text-anchor="middle" fill="#be123c" paint-order="stroke" stroke="white" stroke-width="4">Day ${closure + 2} closure</text>`);
    out.push('</g>');
  }
  out.push(`<g class="region-labels">${regionLabels.join('')}</g>`);
  for (const [node, [x, y]] of Object.entries(positions)) {
    const w = nodeWidth(node, config), h = config.nodeHeight;
    out.push(`<g class="node"><title>${node}</title><path d="${rectangle(x - w / 2, y - h / 2, w, h)}" fill="white" stroke="#64748b" stroke-width="1.2"/>`);
    if (map.rendezvousCandidates.includes(node)) out.push(`<path d="${rectangle(x - w / 2 - 4, y - h / 2 - 4, w + 8, h + 8)}" fill="none" stroke="#166534" stroke-width="1.5"/>`);
    out.push(`<text x="${x}" y="${y + 5}" text-anchor="middle" font-family="Arial" font-size="14">${escape(config.labels[node]!)}</text></g>`);
  }
  return out.join('\n') + '\n</g>\n</svg>\n';
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const maps = JSON.parse(readFileSync(resolve(root, 'docs/rules/maps-v0.0.2.json'), 'utf8')) as MapSpec[];
  const config = JSON.parse(readFileSync(resolve(root, 'scripts/map-layout.config.json'), 'utf8')) as LayoutConfig;
  const check = process.argv.includes('--check');
  const report: Record<string, { positions: Positions; audit: ReturnType<typeof auditLayout> }> = {};
  const files: [string, string][] = [];
  const save = (path: string, content: string) => {
    if (check) {
      if (readFileSync(resolve(root, path), 'utf8') !== content) throw new Error(`${path} is stale; run pnpm maps:layout`);
    } else writeFileSync(resolve(root, path), content);
  };
  for (const map of maps) {
    const positions = optimizeLayout(map, config), audit = auditLayout(map, positions, config);
    if (audit.nodeObstructions || audit.nodeOverlaps) throw new Error(`${map.id}: layout obstructs a node`);
    report[map.id] = { positions, audit };
    files.push([`docs/rules/diagrams/v0.0.2/${map.id}.svg`, renderMap(map, positions, config)]);
    console.log(`${map.id}: ${audit.crossZoneCrossings} cross-zone, ${audit.withinZoneCrossings} within-zone crossings`);
  }
  files.push(['docs/rules/diagrams/v0.0.2/layout-report.json', JSON.stringify(report, null, 2) + '\n']);
  for (const [path, content] of files) save(path, content);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
