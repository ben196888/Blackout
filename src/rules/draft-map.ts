import maps from '../../docs/rules/maps-v0.0.2.json';

export const DRAFT_MAPS = maps;
export type DraftMap = typeof maps[number];
export const roadKey = (a: string, b: string) => [a, b].sort().join('--');
export const mapNodes = (map: DraftMap) => map.regions.flatMap((region) => region.nodes);
export const observationSites = (map: DraftMap) =>
  ['LOOKOUT', ...(map.id !== 'village' ? ['QUARRY'] : []), ...(map.id === 'valley' ? ['OBSERVATORY'] : [])];

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
      reach = within(1);
      relay = nodes.filter((node) => distances[node] === 2);
      break;
    case 'MESH_STUDENT': reach = within(2); break;
    case 'BULLETIN': case 'FACE_TO_FACE': reach = [origin]; break;
    case 'LANDLINE': reach = map.landlines.filter((node) => node !== origin); break;
    case 'SMS': case 'MOBILE_VOICE': reach = nodes.filter((node) => node !== origin); break;
    case 'MOBILE_DATA': reach = within(2); break;
    case 'VO_BROADCAST':
      reach = map.regions.filter(({ id }) => ['CORE', 'SCHOOL', 'RIDGE'].includes(id))
        .flatMap(({ nodes }) => nodes).filter((node) => node !== origin && Number.isFinite(distances[node]));
      break;
    case 'HIGH_GROUND': {
      if (!observationSites(map).includes(origin)) break;
      const regions = origin === 'LOOKOUT' ? ['RIDGE', 'FARM']
        : origin === 'QUARRY' ? ['RIDGE', 'WORKS'] : origin === 'OBSERVATORY' ? ['UPLAND', 'CORE'] : [];
      reach = map.regions.filter(({ id }) => regions.includes(id)).flatMap(({ nodes }) => nodes)
        .filter((node) => node !== origin && !map.enclosed.includes(node));
      break;
    }
  }
  return { reach, relay };
}
