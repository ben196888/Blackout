import { MAP_EDGES, MAP_NODES, NODE_IDS, edgeKey } from '../game/map';
import type { NodeId } from '../types';

/** Layout is authored in viewBox units so every mount scales as one picture. */
export const NODE_POSITIONS: Record<NodeId, [number, number]> = {
  STORE: [90, 80], TEMPLE: [210, 55], VO: [330, 80], BRIDGE_N: [450, 110],
  BRIDGE_S: [520, 180], SCHOOL: [610, 220], CLINIC: [720, 165], FIELD: [700, 300],
  FORD: [600, 370], TEA: [480, 410], POND: [470, 520], COOP: [350, 440],
  MTNRD: [245, 390], FOREST: [140, 345], QUARRY: [75, 245], SHRINE: [50, 150],
};

/** Two letters is all that fits inside a node at the minimal scale. */
export const NODE_CODES: Record<NodeId, string> = {
  STORE: 'ST', TEMPLE: 'TP', VO: 'VO', BRIDGE_N: 'BN', BRIDGE_S: 'BS',
  SCHOOL: 'SC', CLINIC: 'CL', FIELD: 'FL', FORD: 'FD', TEA: 'TE',
  POND: 'PO', COOP: 'CO', MTNRD: 'MR', FOREST: 'FO', QUARRY: 'QY', SHRINE: 'SH',
};

/** The bilingual map labels are too long to sit under a node; these are not. */
export const NODE_SHORT_NAMES: Record<NodeId, string> = {
  STORE: 'Store', TEMPLE: 'Temple Sq', VO: 'Village Office', BRIDGE_N: 'Bridge N',
  BRIDGE_S: 'Bridge S', SCHOOL: 'School', CLINIC: 'Clinic', FIELD: 'Field',
  FORD: 'Ford', TEA: 'Tea Terrace', POND: 'Pond', COOP: 'Co-op',
  MTNRD: 'Mtn Road', FOREST: 'Forest Stn', QUARRY: 'Quarry', SHRINE: 'Shrine',
};

const REGION_SHAPES = [
  { id: 'core', label: 'VILLAGE CENTRE', path: 'M55 15 H370 V130 H115 Q55 130 55 70 Z', fill: '#18231d', x: 190, y: 30 },
  { id: 'school', label: 'SCHOOL', path: 'M565 125 H775 V335 H645 Q570 300 565 225 Z', fill: '#172321', x: 675, y: 147 },
  { id: 'farm', label: 'FARM', path: 'M300 350 H555 V565 H315 Q285 500 300 350 Z', fill: '#20251a', x: 405, y: 478 },
  { id: 'mountain', label: 'MOUNTAIN', path: 'M10 115 H110 L295 330 V435 H100 L10 290 Z', fill: '#211f1c', x: 128, y: 300 },
] as const;

export type MapLabelScale = 'full' | 'compact' | 'minimal';

/** Label sizes are authored in viewBox units, so small mounts need bigger type. */
const SCALES: Record<MapLabelScale, {
  r: number; code: number; name: number; glyph: number;
  region: number; ghost: number; cache: number;
  names: boolean; regions: boolean; glyphs: boolean;
}> = {
  full: { r: 22, code: 13, name: 12, glyph: 11, region: 13, ghost: 13, cache: 14, names: true, regions: true, glyphs: true },
  compact: { r: 26, code: 19, name: 16, glyph: 14, region: 16, ghost: 17, cache: 18, names: true, regions: false, glyphs: true },
  minimal: { r: 31, code: 26, name: 0, glyph: 0, region: 0, ghost: 21, cache: 24, names: false, regions: false, glyphs: false },
};

/** B bulletin board · P landline phone · H high ground. */
export function nodeGlyph(node: NodeId): string {
  const spec = MAP_NODES[node];
  return [spec.bulletin ? 'B' : '', spec.landline ? 'P' : '', spec.highGround ? 'H' : '']
    .filter(Boolean).join(' ');
}

export interface CacheNote {
  /** Pre-formatted, e.g. "F3 B2" or "EMPTY". */
  label: string;
  age: 'fresh' | 'stale';
}

export interface GhostMarker {
  /** Short seat tag plus recency, e.g. "RESERVIST d2". */
  label: string;
  node: NodeId;
}

export interface VillageMapProps {
  /** Where the viewer stands. Omit on the shared Day 0 map, which has no viewer. */
  you?: NodeId | null;
  /** Nodes to ring as reachable right now. */
  reach?: readonly NodeId[];
  /** Edge keys in game/map.ts `edgeKey` form. */
  severedEdges?: readonly string[];
  /** Remembered sightings of other seats, drawn under the node. */
  ghosts?: readonly GhostMarker[];
  /** Cache memory per node, exact only where observed. */
  caches?: Partial<Record<NodeId, CacheNote>>;
  /** Seats certainly standing on your node — named in full above it. */
  withYou?: readonly string[];
  labels?: MapLabelScale;
  onNodeClick?: (node: NodeId) => void;
  ariaLabel?: string;
  className?: string;
  height?: number | string;
}

export function VillageMap({
  you = null,
  reach = [],
  severedEdges = [],
  ghosts = [],
  caches = {},
  withYou = [],
  labels = 'full',
  onNodeClick,
  ariaLabel = 'Village map',
  className,
  height = '100%',
}: VillageMapProps) {
  const s = SCALES[labels];
  const yourPosition = you ? NODE_POSITIONS[you] : null;

  return (
    <svg
      aria-label={ariaLabel}
      className={className ? `village-map ${className}` : 'village-map'}
      role="img"
      style={{ width: '100%', height, display: 'block' }}
      viewBox="0 0 800 580"
    >
      <g>
        {REGION_SHAPES.map((region) => (
          <path d={region.path} key={region.id} style={{ fill: region.fill, stroke: '#243329', strokeWidth: 2 }} />
        ))}
      </g>

      <g style={{ stroke: '#4c5f54', strokeWidth: 3 }}>
        {MAP_EDGES.map((edge) => {
          const key = edgeKey(edge.a, edge.b);
          if (severedEdges.includes(key)) return null;
          const [x1, y1] = NODE_POSITIONS[edge.a];
          const [x2, y2] = NODE_POSITIONS[edge.b];
          // A free crossing reads as the spine of the map, so it gets the signal colour.
          const free = edge.cost === 0;
          return <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} style={free ? { stroke: '#e3b94f', strokeWidth: 5 } : undefined} />;
        })}
      </g>

      <g>
        {MAP_EDGES.filter((edge) => severedEdges.includes(edgeKey(edge.a, edge.b))).map((edge) => {
          const [x1, y1] = NODE_POSITIONS[edge.a];
          const [x2, y2] = NODE_POSITIONS[edge.b];
          // Drawn as geometry, never as text: a text box at the midpoint of a short
          // edge always intersects the neighbouring node's name.
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          const c = 4.5;
          return (
            <g key={edgeKey(edge.a, edge.b)}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} style={{ stroke: '#0d120f', strokeWidth: 11 }} />
              <line x1={x1} y1={y1} x2={x2} y2={y2} style={{ stroke: '#ff8e83', strokeWidth: 4, strokeDasharray: '10 8' }} />
              <circle cx={mx} cy={my} r={9} style={{ fill: '#0d120f', stroke: '#ff8e83', strokeWidth: 2 }} />
              <line x1={mx - c} y1={my - c} x2={mx + c} y2={my + c} style={{ stroke: '#ff8e83', strokeWidth: 2 }} />
              <line x1={mx - c} y1={my + c} x2={mx + c} y2={my - c} style={{ stroke: '#ff8e83', strokeWidth: 2 }} />
            </g>
          );
        })}
      </g>

      <g>
        {reach.map((node) => {
          const position = NODE_POSITIONS[node];
          if (!position) return null;
          return (
            <circle
              cx={position[0]} cy={position[1]} key={`reach-${node}`} r={s.r + 9}
              style={{ fill: 'none', stroke: '#8bd8a7', strokeWidth: 2, strokeDasharray: '4 5' }}
            />
          );
        })}
      </g>

      <g>
        {NODE_IDS.map((node) => {
          const [x, y] = NODE_POSITIONS[node];
          const interactive = Boolean(onNodeClick);
          return (
            <circle
              className={interactive ? 'village-map-node is-clickable' : 'village-map-node'}
              cx={x} cy={y} key={`node-${node}`} r={s.r}
              onClick={onNodeClick ? () => onNodeClick(node) : undefined}
              style={{ fill: '#141b16', stroke: '#5b6f63', strokeWidth: 2, cursor: interactive ? 'pointer' : 'default' }}
            >
              <title>{MAP_NODES[node].label}</title>
            </circle>
          );
        })}
      </g>

      {yourPosition && withYou.length > 0 && (
        <circle cx={yourPosition[0]} cy={yourPosition[1]} r={s.r + 8} style={{ fill: 'none', stroke: '#e3b94f', strokeWidth: 3 }} />
      )}
      {yourPosition && (
        <circle cx={yourPosition[0]} cy={yourPosition[1]} r={s.r} style={{ fill: '#26402f', stroke: '#8bd8a7', strokeWidth: 4 }} />
      )}

      <g style={{ pointerEvents: 'none' }}>
        {s.regions && REGION_SHAPES.map((region) => (
          <text
            fontSize={s.region} key={`region-${region.id}`} textAnchor="middle" x={region.x} y={region.y}
            style={{ fill: '#5d7267', fontWeight: 700, letterSpacing: '.14em' }}
          >{region.label}</text>
        ))}

        {NODE_IDS.map((node) => {
          const [x, y] = NODE_POSITIONS[node];
          const cache = caches[node];
          const glyph = s.glyphs ? nodeGlyph(node) : '';
          const nameY = y + s.r + s.name + 3;
          const cacheY = (s.names ? nameY : y + s.r) + s.cache + 3;
          return (
            <g key={`label-${node}`}>
              {node === you
                ? <text fontSize={s.code} textAnchor="middle" x={x} y={y + Math.round(s.code * 0.36)} style={{ fill: '#8bd8a7', fontWeight: 800, letterSpacing: '.08em' }}>YOU</text>
                : <text fontSize={s.code} textAnchor="middle" x={x} y={y + Math.round(s.code * 0.36)} style={{ fill: '#cfdcd3', fontWeight: 700 }}>{NODE_CODES[node]}</text>}
              {s.names && <text fontSize={s.name} textAnchor="middle" x={x} y={nameY} style={{ fill: '#8ea297' }}>{NODE_SHORT_NAMES[node]}</text>}
              {glyph && <text fontSize={s.glyph} textAnchor="middle" x={x} y={y - s.r - 6} style={{ fill: '#e3b94f' }}>{glyph}</text>}
              {cache && (
                <text
                  fontSize={s.cache} textAnchor="middle" x={x} y={cacheY}
                  style={{ fill: cache.age === 'stale' ? '#6f8076' : '#8bd8a7', fontWeight: 700 }}
                >{cache.label}</text>
              )}
            </g>
          );
        })}

        {ghosts.map((ghost, index) => {
          const position = NODE_POSITIONS[ghost.node];
          if (!position) return null;
          const base = position[1] + s.r
            + (s.names ? s.name + 3 : 0)
            + (caches[ghost.node] ? s.cache + 3 : 0);
          // Stacked so two remembered seats at one node never overprint.
          const stackIndex = ghosts.slice(0, index).filter((other) => other.node === ghost.node).length;
          return (
            <text
              fontSize={s.ghost} key={`ghost-${ghost.node}-${ghost.label}`} textAnchor="middle"
              x={position[0]} y={base + s.ghost + 3 + stackIndex * (s.ghost + 3)}
              style={{ fill: '#6f8076', fontWeight: 700, fontStyle: 'italic' }}
            >{ghost.label}</text>
          );
        })}

        {yourPosition && withYou.map((who, index) => (
          <text
            fontSize={s.ghost} key={`with-${who}`} textAnchor="middle"
            x={yourPosition[0]} y={yourPosition[1] - s.r - 12 - index * (s.ghost + 3)}
            style={{ fill: '#e3b94f', fontWeight: 800, paintOrder: 'stroke', stroke: '#0d120f', strokeWidth: 4 }}
          >{who} HERE</text>
        ))}
      </g>
    </svg>
  );
}
