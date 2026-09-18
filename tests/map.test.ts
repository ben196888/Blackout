import { describe, expect, it } from 'vitest';
import documentedMap from '../docs/rules/maps-v0.0.1.json';
import {
  BRIDGE_SPAN,
  DAY_2_EDGE,
  MAP_EDGES,
  MAP_NODES,
  NODE_IDS,
  RENDEZVOUS_CENTRE_NODES,
  connectedComponents,
  distancesFrom,
  eccentricity,
} from '../src/game/map';
import { BALANCE, DEFAULT_RENDEZVOUS, PLAYER_COUNT, STARTING_NODES } from '../src/constants';

describe('resolved 16-node map', () => {
  it('matches the versioned v0.0.1 map documentation', () => {
    expect(documentedMap.rulesVersion).toBe('0.0.1');
    expect(documentedMap.maps).toEqual([{
      id: 'village',
      players: [PLAYER_COUNT, PLAYER_COUNT],
      nodes: NODE_IDS.map((id) => MAP_NODES[id]),
      edges: MAP_EDGES,
      startingNodes: [...STARTING_NODES],
      defaultRendezvous: DEFAULT_RENDEZVOUS,
      rendezvousChange: {
        night: 4,
        candidates: RENDEZVOUS_CENTRE_NODES.filter((id) => id !== DEFAULT_RENDEZVOUS),
      },
      closures: [{ day: 2, edgeKey: DAY_2_EDGE }, { day: 3, edgeKey: BRIDGE_SPAN }],
    }]);
  });

  it('pins graph size, connectivity, diameter and centre set', () => {
    expect(NODE_IDS).toHaveLength(16);
    expect(MAP_EDGES).toHaveLength(16);
    expect(connectedComponents()).toHaveLength(1);
    const diameter = Math.max(...NODE_IDS.flatMap((node) => Object.values(distancesFrom(node))));
    expect(diameter).toBe(7);
    expect(NODE_IDS.filter((node) => eccentricity(node) <= 6).sort()).toEqual([
      'BRIDGE_N', 'BRIDGE_S', 'COOP', 'FIELD', 'FORD', 'MTNRD', 'SCHOOL', 'SHRINE', 'TEA', 'VO',
    ]);
    expect([...RENDEZVOUS_CENTRE_NODES].sort()).toEqual(
      NODE_IDS.filter((node) => eccentricity(node) <= 6).sort(),
    );
  });

  it('splits into the pinned two 8-node halves and preserves supply asymmetry', () => {
    const components = connectedComponents([DAY_2_EDGE, BRIDGE_SPAN]);
    expect(components.map((component) => component.length)).toEqual([8, 8]);
    const north = ['BRIDGE_N', 'FOREST', 'MTNRD', 'QUARRY', 'SHRINE', 'STORE', 'TEMPLE', 'VO'].sort();
    const south = ['BRIDGE_S', 'CLINIC', 'COOP', 'FIELD', 'FORD', 'POND', 'SCHOOL', 'TEA'].sort();
    expect(components).toContainEqual(north);
    expect(components).toContainEqual(south);
    const supplies = (nodes: string[]) => nodes.reduce((total, node) => ({
      food: total.food + MAP_NODES[node as keyof typeof MAP_NODES].cache.food,
      battery: total.battery + MAP_NODES[node as keyof typeof MAP_NODES].cache.battery,
    }), { food: 0, battery: 0 });
    const tunedSupplies = (nodes: string[]) => nodes.reduce((total, node) => {
      const supply = BALANCE.mapSupply[node as keyof typeof BALANCE.mapSupply];
      return { food: total.food + supply.food, battery: total.battery + supply.battery };
    }, { food: 0, battery: 0 });
    expect(supplies(north)).toEqual(tunedSupplies(north));
    expect(supplies(south)).toEqual(tunedSupplies(south));
  });

  it('reconnects the graph when either scheduled cut is cleared', () => {
    expect(connectedComponents([BRIDGE_SPAN])).toHaveLength(1);
    expect(connectedComponents([DAY_2_EDGE])).toHaveLength(1);
  });

  it('has bulletin boards only at the four resolved locations', () => {
    expect(NODE_IDS.filter((node) => MAP_NODES[node].bulletin)).toEqual(['VO', 'SCHOOL', 'COOP', 'FOREST']);
  });

  it('keeps the high-ground rule data-driven and shows bilingual place names', () => {
    expect(NODE_IDS.filter((node) => MAP_NODES[node].highGround)).toEqual(['SHRINE']);
    expect(Object.values(MAP_NODES).every((node) => /[^\u0000-\u007f]/.test(node.label))).toBe(true);
  });
});
