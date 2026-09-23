import maps from '../../docs/rules/maps-v0.0.2.json';

export const DRAFT_MAPS = maps;
export type DraftMap = typeof maps[number];
export const roadKey = (a: string, b: string) => [a, b].sort().join('--');
export const mapNodes = (map: DraftMap) => map.regions.flatMap((region) => region.nodes);
export const meshHighGroundSites = (map: DraftMap) => map.meshHighGroundLinks.map(([site]) => site!);

/** Former open-node sight footprint, now only a Mesh radio footprint. */
export function meshHighGroundCoverage(map: DraftMap, site: string): string[] {
  if (!meshHighGroundSites(map).includes(site)) return [];
  const zones = site === 'LOOKOUT' ? ['RIDGE', 'FARM']
    : site === 'QUARRY' ? ['RIDGE', 'WORKS'] : ['UPLAND', 'CORE'];
  return map.regions.filter(({ id }) => zones.includes(id)).flatMap(({ nodes }) => nodes)
    .filter((node) => node !== site && !map.enclosed.includes(node));
}

/** Every draft road costs one move; closed roads cannot carry a movement-distance method. */
export function draftDistances(map: DraftMap, from: string, closures = 0): Record<string, number> {
  const distances: Record<string, number> = Object.fromEntries(mapNodes(map).map((node) => [node, Infinity]));
  const blocked = new Set(map.closures.slice(0, closures).map(([a, b]) => roadKey(a!, b!)));
  distances[from] = 0;
  const queue = [from];
  for (const node of queue) {
    for (const [a, b] of map.edges) {
      if (blocked.has(roadKey(a!, b!))) continue;
      const next = a === node ? b : b === node ? a : undefined;
      if (next && distances[next] === Infinity) {
        distances[next] = distances[node]! + 1;
        queue.push(next);
      }
    }
  }
  return distances;
}

/** Walkie coverage follows a neighborhood footprint plus the sender's border roads. */
export function draftWalkieReach(map: DraftMap, origin: string, reservist = false): string[] {
  const home = map.regions.find(({ nodes }) => nodes.includes(origin));
  if (!home) return [];
  const sameZone = new Set(home.nodes);
  const borderNeighbors = new Set(map.edges.flatMap(([a, b]) =>
    a === origin && b && !sameZone.has(b) ? [b]
      : b === origin && a && !sameZone.has(a) ? [a] : []));
  const covered = new Set([...sameZone, ...borderNeighbors]);
  if (reservist) for (const [a, b] of map.edges) {
    if (covered.has(a!)) borderNeighbors.add(b!);
    if (covered.has(b!)) borderNeighbors.add(a!);
  }
  return mapNodes(map).filter((node) => node !== origin && (covered.has(node) || (reservist && borderNeighbors.has(node))));
}

/** Mesh shares local radio coverage, with high-ground radio links but no passive sight. */
export function draftMeshReach(map: DraftMap, origin: string, student = false): string[] {
  const covered = new Set(draftWalkieReach(map, origin));
  for (const site of meshHighGroundSites(map)) {
    const footprint = meshHighGroundCoverage(map, site);
    if (origin === site) for (const node of footprint) covered.add(node);
    else if (footprint.includes(origin)) covered.add(site);
  }
  for (const [site, distant] of map.meshHighGroundLinks) {
    if (origin === site) covered.add(distant!);
    if (origin === distant) covered.add(site!);
  }
  if (student) {
    const ordinary = new Set(covered);
    for (const [a, b] of map.edges) {
      if (ordinary.has(a!)) covered.add(b!);
      if (ordinary.has(b!)) covered.add(a!);
    }
  }
  return mapNodes(map).filter((node) => node !== origin && covered.has(node));
}

export function draftReach(map: DraftMap, method: string, origin: string, closures = 0) {
  const nodes = mapNodes(map);
  const distances = draftDistances(map, origin, closures);
  const within = (radius: number) => nodes.filter((node) => node !== origin && distances[node]! <= radius);
  let reach: string[] = [];
  let relay: string[] = [];
  switch (method) {
    case 'WALKIE': reach = draftWalkieReach(map, origin); break;
    case 'WALKIE_RESERVIST': reach = draftWalkieReach(map, origin, true); break;
    case 'MESH':
    case 'MESH_STUDENT': {
      reach = draftMeshReach(map, origin, method === 'MESH_STUDENT');
      const direct = new Set(reach);
      const viaOneHolder = new Set(reach.flatMap((site) => draftMeshReach(map, site)));
      relay = nodes.filter((node) => node !== origin && !direct.has(node) && viaOneHolder.has(node));
      break;
    }
    case 'BULLETIN': case 'FACE_TO_FACE': reach = [origin]; break;
    case 'LANDLINE': reach = map.landlines.filter((node) => node !== origin); break;
    case 'SMS': case 'MOBILE_VOICE': reach = nodes.filter((node) => node !== origin); break;
    case 'MOBILE_DATA': reach = within(2); break;
    case 'VO_BROADCAST':
      reach = map.regions.filter(({ id }) => ['CORE', 'SCHOOL', 'RIDGE'].includes(id))
        .flatMap(({ nodes }) => nodes).filter((node) => node !== origin && Number.isFinite(distances[node]));
      break;
  }
  return { reach, relay };
}
