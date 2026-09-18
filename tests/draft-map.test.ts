import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DRAFT_MAPS, draftDistances, draftReach, mapNodes, observationSites, roadKey } from '../src/rules/draft-map';

for (const map of DRAFT_MAPS) describe(`${map.id} draft preview`, () => {
  it('uses diagram nodes, roads and neighborhoods matching the canonical graph', () => {
    const svg = readFileSync(`docs/rules/diagrams/v0.0.2/${map.id}.svg`, 'utf8');
    const ids = (kind: string) => [...svg.matchAll(new RegExp(`<g[^>]*class="${kind}">\\s*<title>([^<]+)</title>`, 'g'))]
      .map((match) => match[1]!.replaceAll('&#45;', '-'));
    expect(ids('node').sort()).toEqual(mapNodes(map).sort());
    expect(ids('edge').map((id) => roadKey(...id.split('--') as [string, string])).sort())
      .toEqual(map.edges.map(([a, b]) => roadKey(a!, b!)).sort());
    expect(ids('cluster').sort()).toEqual(map.regions.map(({ id }) => `cluster_${id}`).sort());
  });

  it('recomputes walkie and mesh range after closures, without disconnecting the map', () => {
    expect(draftReach(map, 'WALKIE', 'VO').reach).toContain('SCHOOL');
    expect(draftReach(map, 'WALKIE', 'VO', 2).reach).not.toContain('SCHOOL');
    expect(draftDistances(map, 'VO', 2).SCHOOL).toBe(3);
    expect(Object.values(draftDistances(map, 'VO', 2)).every(Number.isFinite)).toBe(true);
    const mesh = draftReach(map, 'MESH', 'VO', 2);
    expect(mesh.reach).toContain('TEMPLE');
    expect(mesh.relay).toContain('CLINIC');
    expect(mesh.reach).not.toContain('CLINIC');
    expect(draftReach(map, 'MESH_STUDENT', 'VO', 2).reach).toContain('CLINIC');
  });

  it('limits leader broadcasts and observation to their authored neighborhoods', () => {
    const broadcast = draftReach(map, 'VO_BROADCAST', 'VO').reach;
    expect(broadcast).toContain('SCHOOL');
    expect(broadcast).toContain('SHRINE');
    for (const node of map.regions.filter(({ id }) => !['CORE', 'SCHOOL', 'RIDGE'].includes(id)).flatMap(({ nodes }) => nodes)) {
      expect(broadcast).not.toContain(node);
    }
    for (const site of observationSites(map)) {
      const sight = draftReach(map, 'HIGH_GROUND', site).reach;
      expect(sight.length).toBeGreaterThan(0);
      expect(sight).toEqual(draftReach(map, 'HIGH_GROUND', site, 2).reach);
      expect(sight.some((node) => map.enclosed.includes(node))).toBe(false);
    }
    expect(draftReach(map, 'HIGH_GROUND', 'LOOKOUT').reach).toContain('TEA');
    expect(draftReach(map, 'HIGH_GROUND', 'LOOKOUT').reach).not.toContain('TEMPLE');
    expect(draftReach(map, 'HIGH_GROUND', 'SHRINE').reach).toEqual([]);
  });

  it('uses map-specific phones and keeps the mobile-data preview within the School zone', () => {
    expect(draftReach(map, 'LANDLINE', 'SCHOOL').reach.sort()).toEqual(map.landlines.filter((node) => node !== 'SCHOOL').sort());
    expect(draftReach(map, 'MOBILE_DATA', 'SCHOOL', 2).reach).not.toContain('VO');
    expect(draftReach(map, 'FACE_TO_FACE', 'SCHOOL').reach).toEqual(['SCHOOL']);
  });
});
