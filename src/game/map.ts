import type { Inventory, NodeId } from '../types';

export type Region = 'CORE' | 'SCHOOL' | 'FARM' | 'MOUNTAIN' | 'LINK';

export interface NodeSpec {
  id: NodeId;
  label: string;
  region: Region;
  open: boolean;
  landline?: true;
  bulletin?: true;
  highGround?: true;
  cache: Inventory;
}

export interface EdgeSpec {
  a: NodeId;
  b: NodeId;
  cost: 0 | 1;
}

export const NODE_IDS: NodeId[] = [
  'VO', 'TEMPLE', 'STORE', 'SCHOOL', 'CLINIC', 'FIELD', 'COOP', 'TEA',
  'POND', 'SHRINE', 'QUARRY', 'FOREST', 'BRIDGE_N', 'BRIDGE_S', 'MTNRD', 'FORD',
];

export const MAP_NODES: Record<NodeId, NodeSpec> = {
  VO: { id: 'VO', label: 'Village Office', region: 'CORE', open: false, landline: true, bulletin: true, cache: { food: 0, battery: 2 } },
  TEMPLE: { id: 'TEMPLE', label: 'Temple', region: 'CORE', open: true, cache: { food: 3, battery: 0 } },
  STORE: { id: 'STORE', label: 'Store', region: 'CORE', open: false, cache: { food: 9, battery: 0 } },
  SCHOOL: { id: 'SCHOOL', label: 'School', region: 'SCHOOL', open: true, landline: true, bulletin: true, cache: { food: 4, battery: 0 } },
  CLINIC: { id: 'CLINIC', label: 'Clinic', region: 'SCHOOL', open: false, landline: true, cache: { food: 2, battery: 2 } },
  FIELD: { id: 'FIELD', label: 'Field', region: 'SCHOOL', open: true, cache: { food: 0, battery: 0 } },
  COOP: { id: 'COOP', label: 'Co-op', region: 'FARM', open: false, bulletin: true, cache: { food: 0, battery: 8 } },
  TEA: { id: 'TEA', label: 'Tea fields', region: 'FARM', open: true, cache: { food: 3, battery: 0 } },
  POND: { id: 'POND', label: 'Pond', region: 'FARM', open: true, cache: { food: 1, battery: 0 } },
  SHRINE: { id: 'SHRINE', label: 'Shrine', region: 'MOUNTAIN', open: true, highGround: true, cache: { food: 2, battery: 0 } },
  QUARRY: { id: 'QUARRY', label: 'Quarry', region: 'MOUNTAIN', open: true, cache: { food: 0, battery: 0 } },
  FOREST: { id: 'FOREST', label: 'Forest Station', region: 'MOUNTAIN', open: false, landline: true, bulletin: true, cache: { food: 0, battery: 0 } },
  BRIDGE_N: { id: 'BRIDGE_N', label: 'Bridge North', region: 'LINK', open: true, cache: { food: 0, battery: 0 } },
  BRIDGE_S: { id: 'BRIDGE_S', label: 'Bridge South', region: 'LINK', open: true, cache: { food: 0, battery: 0 } },
  MTNRD: { id: 'MTNRD', label: 'Mountain Road', region: 'LINK', open: true, cache: { food: 0, battery: 0 } },
  FORD: { id: 'FORD', label: 'Ford', region: 'LINK', open: true, cache: { food: 0, battery: 0 } },
};

export const MAP_EDGES: EdgeSpec[] = [
  { a: 'STORE', b: 'TEMPLE', cost: 1 },
  { a: 'TEMPLE', b: 'VO', cost: 1 },
  { a: 'VO', b: 'BRIDGE_N', cost: 1 },
  { a: 'BRIDGE_N', b: 'BRIDGE_S', cost: 0 },
  { a: 'BRIDGE_S', b: 'SCHOOL', cost: 1 },
  { a: 'SCHOOL', b: 'CLINIC', cost: 1 },
  { a: 'SCHOOL', b: 'FIELD', cost: 1 },
  { a: 'FIELD', b: 'FORD', cost: 1 },
  { a: 'FORD', b: 'TEA', cost: 1 },
  { a: 'TEA', b: 'COOP', cost: 1 },
  { a: 'TEA', b: 'POND', cost: 1 },
  { a: 'COOP', b: 'MTNRD', cost: 1 },
  { a: 'MTNRD', b: 'FOREST', cost: 1 },
  { a: 'FOREST', b: 'QUARRY', cost: 1 },
  { a: 'QUARRY', b: 'SHRINE', cost: 1 },
  { a: 'SHRINE', b: 'STORE', cost: 1 },
];

export function edgeKey(a: NodeId, b: NodeId): string {
  return [a, b].sort().join('–');
}

export const DAY_2_EDGE = edgeKey('COOP', 'MTNRD');
export const BRIDGE_SPAN = edgeKey('BRIDGE_N', 'BRIDGE_S');

export function getEdge(a: NodeId, b: NodeId): EdgeSpec | undefined {
  return MAP_EDGES.find((edge) =>
    (edge.a === a && edge.b === b) || (edge.a === b && edge.b === a));
}

export function neighbors(node: NodeId, severed: readonly string[] = []): Array<{ node: NodeId; cost: 0 | 1 }> {
  return MAP_EDGES.flatMap((edge) => {
    if (severed.includes(edgeKey(edge.a, edge.b))) return [];
    if (edge.a === node) return [{ node: edge.b, cost: edge.cost }];
    if (edge.b === node) return [{ node: edge.a, cost: edge.cost }];
    return [];
  });
}

export function distancesFrom(start: NodeId, severed: readonly string[] = []): Record<NodeId, number> {
  const distance = Object.fromEntries(NODE_IDS.map((node) => [node, Number.POSITIVE_INFINITY])) as Record<NodeId, number>;
  distance[start] = 0;
  const deque: NodeId[] = [start];
  while (deque.length) {
    const current = deque.shift()!;
    for (const next of neighbors(current, severed)) {
      const candidate = distance[current] + next.cost;
      if (candidate >= distance[next.node]) continue;
      distance[next.node] = candidate;
      if (next.cost === 0) deque.unshift(next.node);
      else deque.push(next.node);
    }
  }
  return distance;
}

export function eccentricity(node: NodeId, severed: readonly string[] = []): number {
  return Math.max(...Object.values(distancesFrom(node, severed)));
}

export function connectedComponents(severed: readonly string[] = []): NodeId[][] {
  const unseen = new Set(NODE_IDS);
  const components: NodeId[][] = [];
  while (unseen.size) {
    const first = unseen.values().next().value as NodeId;
    const component: NodeId[] = [];
    const queue = [first];
    unseen.delete(first);
    while (queue.length) {
      const current = queue.shift()!;
      component.push(current);
      for (const { node } of neighbors(current, severed)) {
        if (unseen.delete(node)) queue.push(node);
      }
    }
    components.push(component.sort());
  }
  return components;
}

export function validatePath(start: NodeId, path: readonly NodeId[], severed: readonly string[]): { cost: number; entered: NodeId[] } | null {
  let current = start;
  let cost = 0;
  const entered: NodeId[] = [];
  for (const node of path) {
    const edge = getEdge(current, node);
    if (!edge || severed.includes(edgeKey(current, node))) return null;
    cost += edge.cost;
    entered.push(node);
    current = node;
  }
  return path.length ? { cost, entered } : null;
}

export function shortestPath(start: NodeId, target: NodeId, severed: readonly string[] = []): NodeId[] | null {
  const distance = Object.fromEntries(NODE_IDS.map((node) => [node, Number.POSITIVE_INFINITY])) as Record<NodeId, number>;
  const previous: Partial<Record<NodeId, NodeId>> = {};
  distance[start] = 0;
  const queue: NodeId[] = [start];
  while (queue.length) {
    queue.sort((a, b) => distance[a] - distance[b]);
    const current = queue.shift()!;
    if (current === target) break;
    for (const next of neighbors(current, severed)) {
      const candidate = distance[current] + next.cost;
      if (candidate >= distance[next.node]) continue;
      distance[next.node] = candidate;
      previous[next.node] = current;
      if (!queue.includes(next.node)) queue.push(next.node);
    }
  }
  if (!Number.isFinite(distance[target])) return null;
  const path: NodeId[] = [];
  let current = target;
  while (current !== start) {
    path.unshift(current);
    const prior = previous[current];
    if (!prior) return null;
    current = prior;
  }
  return path;
}

export function initialCaches(): Record<NodeId, Inventory> {
  return Object.fromEntries(
    NODE_IDS.map((node) => [node, { ...MAP_NODES[node].cache }]),
  ) as Record<NodeId, Inventory>;
}
