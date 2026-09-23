import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DRAFT_MAPS, draftDistances, draftMeshReach, draftReach, draftWalkieReach, mapNodes, meshHighGroundCoverage, meshHighGroundSites, roadKey } from '../src/rules/draft-map';

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

  it('covers Barn’s Farm zone and its own two border neighbors on every scale', () => {
    const farm = map.regions.find(({ id }) => id === 'FARM')!;
    expect(draftWalkieReach(map, 'BARN').sort()).toEqual(
      [...farm.nodes.filter((node) => node !== 'BARN'), 'FIELD', 'QUARRY'].sort(),
    );
    expect(draftWalkieReach(map, 'COOP')).not.toContain('FIELD');
    expect(draftWalkieReach(map, 'BARN', true)).toContain('SCHOOL');
    expect(draftWalkieReach(map, 'BARN')).not.toContain('SCHOOL');
    expect(draftReach(map, 'WALKIE_RESERVIST', 'BARN').reach)
      .toEqual(draftWalkieReach(map, 'BARN', true));
  });

  it('keeps radio coverage through road closures', () => {
    expect(draftReach(map, 'WALKIE', 'VO').reach).toContain('SCHOOL');
    expect(draftReach(map, 'WALKIE', 'VO', 2).reach).toEqual(draftReach(map, 'WALKIE', 'VO').reach);
    expect(draftReach(map, 'WALKIE_RESERVIST', 'VO', 2).reach)
      .toEqual(draftReach(map, 'WALKIE_RESERVIST', 'VO').reach);
    expect(draftDistances(map, 'VO', 2).SCHOOL).toBe(3);
    expect(Object.values(draftDistances(map, 'VO', 2)).every(Number.isFinite)).toBe(true);
    const mesh = draftReach(map, 'MESH', 'VO', 2);
    expect(mesh.reach).toContain('TEMPLE');
    expect(mesh.reach).toContain('SCHOOL');
    expect(mesh.reach).toEqual(draftReach(map, 'MESH', 'VO').reach);
    expect(mesh.relay).toContain('FIELD');
    expect(mesh.reach).not.toContain('FIELD');
    expect(draftReach(map, 'MESH_STUDENT', 'VO', 2).reach).toContain('CLINIC');
  });

  it('adds narrow two-way Mesh links only at named high-ground sites', () => {
    expect(map.meshHighGroundLinks.every(([site, target]) =>
      meshHighGroundSites(map).includes(site!) && mapNodes(map).includes(target!))).toBe(true);
    for (const [site, target] of map.meshHighGroundLinks) {
      expect(map.edges.some(([a, b]) => (a === site && b === target) || (a === target && b === site))).toBe(false);
      expect(draftMeshReach(map, site!)).toContain(target);
      expect(draftMeshReach(map, target!)).toContain(site);
      expect(draftMeshReach(map, site!)).toEqual(draftReach(map, 'MESH', site!).reach);
      expect(draftMeshReach(map, site!)).toEqual(draftReach(map, 'MESH', site!, 2).reach);
    }
    expect(draftMeshReach(map, 'LOOKOUT')).toContain('FIELD');
    expect(draftMeshReach(map, 'LOOKOUT')).not.toContain('SCHOOL');
    expect(draftMeshReach(map, 'SCHOOL')).not.toContain('LOOKOUT');
    expect(draftReach(map, 'MESH', 'LOOKOUT').relay).toContain('SCHOOL');
    expect(draftMeshReach(map, 'LOOKOUT', true)).toContain('SCHOOL');
    if (map.id !== 'village') {
      expect(draftMeshReach(map, 'QUARRY')).toContain('DOCK');
      expect(draftMeshReach(map, 'QUARRY')).not.toContain('FERRY');
    }
    if (map.id === 'valley') {
      expect(draftMeshReach(map, 'OBSERVATORY')).toContain('SHELTER');
      expect(draftMeshReach(map, 'OBSERVATORY')).not.toContain('MARKET');
    }
  });

  it('limits leader broadcasts and removes passive sight in favor of Mesh high ground', () => {
    const broadcast = draftReach(map, 'VO_BROADCAST', 'VO').reach;
    expect(broadcast).toContain('SCHOOL');
    expect(broadcast).toContain('SHRINE');
    for (const node of map.regions.filter(({ id }) => !['CORE', 'SCHOOL', 'RIDGE'].includes(id)).flatMap(({ nodes }) => nodes)) {
      expect(broadcast).not.toContain(node);
    }
    for (const site of meshHighGroundSites(map)) {
      const coverage = meshHighGroundCoverage(map, site);
      expect(coverage.length).toBeGreaterThan(0);
      expect(coverage.some((node) => map.enclosed.includes(node))).toBe(false);
      for (const node of coverage) {
        expect(draftMeshReach(map, site)).toContain(node);
        expect(draftMeshReach(map, node)).toContain(site);
      }
      expect(draftReach(map, 'HIGH_GROUND', site).reach).toEqual([]);
    }
    expect(draftMeshReach(map, 'LOOKOUT')).toContain('TEA');
    expect(draftMeshReach(map, 'LOOKOUT')).not.toContain('TEMPLE');
    expect(draftReach(map, 'HIGH_GROUND', 'SHRINE').reach).toEqual([]);
    if (map.id !== 'village') expect(draftMeshReach(map, 'QUARRY')).not.toContain('DEPOT');
  });

  it('uses map-specific phones and keeps the mobile-data preview within the School zone', () => {
    expect(draftReach(map, 'LANDLINE', 'SCHOOL').reach.sort()).toEqual(map.landlines.filter((node) => node !== 'SCHOOL').sort());
    expect(draftReach(map, 'MOBILE_DATA', 'SCHOOL', 2).reach).not.toContain('VO');
    expect(draftReach(map, 'FACE_TO_FACE', 'SCHOOL').reach).toEqual(['SCHOOL']);
  });
});
