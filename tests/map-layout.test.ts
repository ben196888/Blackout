import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { auditLayout, layoutCost, optimizeLayout, renderMap, roadSegment, roadsOverlap,
  type LayoutConfig, type MapSpec, type Positions } from '../scripts/map-layout.mjs';
import maps from '../docs/rules/maps-v0.0.2.json';
import config from '../scripts/map-layout.config.json';

const settings = config as unknown as LayoutConfig;
const report = JSON.parse(readFileSync('docs/rules/diagrams/v0.0.2/layout-report.json', 'utf8')) as Record<string, {
  positions: Positions; audit: ReturnType<typeof auditLayout>;
}>;

describe('map layout geometry and priorities', () => {
  it('counts proper crossings and collinear overlap, without inventing endpoint junctions', () => {
    expect(roadsOverlap([[0, 0], [10, 10]], [[0, 10], [10, 0]])).toBe(true);
    expect(roadsOverlap([[0, 0], [10, 0]], [[5, 0], [15, 0]])).toBe(true);
    expect(roadsOverlap([[0, 0], [10, 0]], [[10, 0], [20, 0]])).toBe(false);
    expect(roadsOverlap([[0, 0], [10, 0]], [[0, 1], [10, 1]])).toBe(false);
  });

  it('never trades one cross-zone crossing for any number of local crossings', () => {
    const empty = { crossZoneCrossings: 0, withinZoneCrossings: 0, nodeObstructions: 0, nodeOverlaps: 0, crossingPairs: [] };
    expect(layoutCost({ ...empty, withinZoneCrossings: 190 }, 20))
      .toBeLessThan(layoutCost({ ...empty, crossZoneCrossings: 1 }, 20));
    expect(layoutCost({ ...empty, crossZoneCrossings: 190 }, 20))
      .toBeLessThan(layoutCost({ ...empty, nodeObstructions: 1 }, 20));
  });

  it('deterministically uncrosses roads by rearranging their endpoints inside zones', () => {
    const fixture: MapSpec = { id: 'fixture', players: [4, 4], regions: [
      { id: 'LEFT', nodes: ['A', 'B'] }, { id: 'RIGHT', nodes: ['C', 'D'] },
    ], edges: [['A', 'D'], ['B', 'C']], closures: [], rendezvousCandidates: [] };
    const start: Positions = { A: [0, 0], B: [0, 100], C: [500, 0], D: [500, 100] };
    const options: LayoutConfig = { ...settings, restarts: 2, iterations: 500,
      labels: { A: 'A', B: 'B', C: 'C', D: 'D' },
      centers: { fixture: { LEFT: [0, 50], RIGHT: [500, 50] } }, initialPositions: { fixture: start } };
    expect(auditLayout(fixture, start, options).crossZoneCrossings).toBe(1);
    const result = optimizeLayout(fixture, options);
    expect(auditLayout(fixture, result, options).crossZoneCrossings).toBe(0);
    expect(optimizeLayout(fixture, options)).toEqual(result);
  });
});

for (const map of maps) it(`${map.id}: audited geometry is exactly the geometry published in the SVG`, () => {
  const { positions, audit } = report[map.id]!;
  expect(auditLayout(map, positions, settings)).toEqual(audit);
  expect(audit.nodeObstructions).toBe(0);
  expect(audit.nodeOverlaps).toBe(0);
  expect(Object.keys(positions).sort()).toEqual(map.regions.flatMap(({ nodes }) => nodes).sort());
  expect(renderMap(map, positions, settings)).toBe(readFileSync(`docs/rules/diagrams/v0.0.2/${map.id}.svg`, 'utf8'));
});

it.each([
  ['village', ['QUARRY', 'STORE'], ['FOREST', 'VO']],
  ['town', ['SCHOOL', 'DOCK'], ['FIELD', 'BARN']],
] as const)('%s keeps the reported cross-zone road pair separate', (id, a, b) => {
  const positions = report[id]!.positions;
  expect(roadsOverlap(roadSegment([...a], positions, settings), roadSegment([...b], positions, settings))).toBe(false);
});
