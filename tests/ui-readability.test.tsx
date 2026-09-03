import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CHARACTER_ABILITY_TEXT, CharacterAbility } from '../src/components/CharacterAbility';
import { receiptDetail, sendAcknowledgementText } from '../src/components/CommsPanel';
import { DayStamp } from '../src/components/DayStamp';
import { cacheShorthand, clearableEdgesAt, outboxTarget } from '../src/components/GameBoard';
import { REACH_SPECS } from '../src/components/RulesPage';
import { NODE_CODES, NODE_POSITIONS, NODE_SHORT_NAMES, VillageMap, nodeGlyph } from '../src/components/VillageMap';
import { METHOD_COLUMN, METHOD_LETTER, METHOD_ORDER, isDeadOnDay } from '../src/components/methodDisplay';
import { CHARACTER_IDS, METHOD_IDS } from '../src/constants';
import { MAP_NODES, NODE_IDS, edgeKey } from '../src/game/map';

describe('authoritative communication feedback', () => {
  it('does not imply remote delivery and distinguishes an empty face-to-face audience', () => {
    expect(sendAcknowledgementText({ sequence: 1, day: 2, state: 'sent' }))
      .toBe('Sent. Delivery is unknown.');
    expect(sendAcknowledgementText({ sequence: 2, day: 2, state: 'delivered', recipientCount: 0 }))
      .toBe('No one received the face-to-face message.');
    expect(sendAcknowledgementText({ sequence: 3, day: 2, state: 'delivered', recipientCount: 2 }))
      .toBe('Delivered face-to-face to 2 people.');
  });

  it('spells out that a remote send is never a confirmed delivery', () => {
    expect(receiptDetail({ sequence: 1, day: 2, state: 'sent' }))
      .toContain('not something the game will tell you');
    expect(receiptDetail({ sequence: 2, day: 2, state: 'delivered', recipientCount: 0 }))
      .toContain('reached nobody');
  });
});

describe('readability helpers', () => {
  it('renders current and stale day stamps with explicit age semantics', () => {
    expect(renderToStaticMarkup(<DayStamp currentDay={4} observedDay={4} verb="Observed" />))
      .toContain('fresh');
    const stale = renderToStaticMarkup(<DayStamp currentDay={4} observedDay={2} verb="Observed" />);
    expect(stale).toContain('stale');
    expect(stale).toContain('2 days old');
  });

  it('defines visible ability text for every character', () => {
    expect(Object.keys(CHARACTER_ABILITY_TEXT)).toEqual([...CHARACTER_IDS]);
    for (const character of CHARACTER_IDS) {
      expect(renderToStaticMarkup(<CharacterAbility character={character} />)).toContain('Ability:');
      expect(CHARACTER_ABILITY_TEXT[character].length).toBeGreaterThan(30);
    }
  });

  it('offers road clearing only at the acting player endpoint with named labels', () => {
    const bridge = edgeKey('BRIDGE_N', 'BRIDGE_S');
    const farmRoad = edgeKey('COOP', 'MTNRD');
    expect(clearableEdgesAt('BRIDGE_N', [bridge, farmRoad])).toEqual([
      { key: bridge, label: 'Suspension Bridge North 吊橋北端 ↔ Suspension Bridge South 吊橋南端' },
    ]);
    expect(clearableEdgesAt('VO', [bridge, farmRoad])).toEqual([]);
  });

  it('writes cache shorthand that distinguishes a picked-clean node from an unseen one', () => {
    expect(cacheShorthand({ food: 0, battery: 0 })).toBe('EMPTY');
    expect(cacheShorthand({ food: 3, battery: 0 })).toBe('F3');
    expect(cacheShorthand({ food: 0, battery: 8 })).toBe('B8');
    expect(cacheShorthand({ food: 2, battery: 2 })).toBe('F2 B2');
  });
});

describe('telecom matrix vocabulary', () => {
  it('covers every method exactly once, in a stable column order', () => {
    expect([...METHOD_ORDER].sort()).toEqual([...METHOD_IDS].sort());
    for (const method of METHOD_ORDER) {
      expect(METHOD_LETTER[method]).toHaveLength(1);
      expect(METHOD_COLUMN[method].length).toBeGreaterThan(2);
    }
  });

  it('marks infrastructure methods down on the days the schedule kills them', () => {
    expect(isDeadOnDay('WALKIE', 7)).toBe(false);
    expect(isDeadOnDay('MESH', 7)).toBe(false);
    expect(isDeadOnDay('BULLETIN', 7)).toBe(false);
    expect(isDeadOnDay('MOBILE_VOICE', 1)).toBe(false);
    expect(isDeadOnDay('MOBILE_VOICE', 2)).toBe(true);
    expect(isDeadOnDay('SMS', 2)).toBe(false);
    expect(isDeadOnDay('SMS', 3)).toBe(true);
    expect(isDeadOnDay('LANDLINE', 3)).toBe(true);
    expect(isDeadOnDay('MOBILE_DATA', 5)).toBe(true);
    expect(isDeadOnDay('MOBILE_DATA', 6)).toBe(false);
    expect(isDeadOnDay('MOBILE_DATA', 7)).toBe(true);
  });
});

describe('village map', () => {
  it('gives every map node a position, a two-letter code and a short name', () => {
    for (const node of NODE_IDS) {
      expect(NODE_POSITIONS[node]).toHaveLength(2);
      expect(NODE_CODES[node]).toHaveLength(2);
      expect(NODE_SHORT_NAMES[node].length).toBeGreaterThan(2);
    }
    expect(new Set(Object.values(NODE_CODES)).size).toBe(NODE_IDS.length);
  });

  it('derives facility glyphs from the map rather than a second hand-kept list', () => {
    expect(nodeGlyph('VO')).toBe('B P');
    expect(nodeGlyph('CLINIC')).toBe('P');
    expect(nodeGlyph('COOP')).toBe('B');
    expect(nodeGlyph('SHRINE')).toBe('H');
    expect(nodeGlyph('POND')).toBe('');
  });

  it('draws the viewer, a severed road and a remembered sighting', () => {
    const markup = renderToStaticMarkup(
      <VillageMap
        caches={{ TEA: { label: 'F3', age: 'fresh' }, SCHOOL: { label: 'F4', age: 'stale' } }}
        ghosts={[{ label: 'P3 d2', node: 'TEA' }]}
        reach={['CLINIC']}
        severedEdges={[edgeKey('BRIDGE_N', 'BRIDGE_S')]}
        withYou={['NURSE']}
        you="SCHOOL"
      />,
    );
    expect(markup).toContain('>YOU<');
    expect(markup).toContain('NURSE HERE');
    expect(markup).toContain('P3 d2');
    expect(markup).toContain('#ff8e83');
    expect(markup).toContain('>F3<');
  });
});

describe('rules page reach explorer', () => {
  it('derives reach from the live map so the rules cannot drift from the engine', () => {
    const byId = Object.fromEntries(REACH_SPECS.map((spec) => [spec.id, spec]));
    expect(byId.WALKIE!.reach('SCHOOL').sort()).toEqual(['BRIDGE_N', 'BRIDGE_S', 'CLINIC', 'FIELD']);
    expect(byId.BULLETIN!.reach('SCHOOL')).toEqual(['SCHOOL']);
    expect(byId.LANDLINE!.reach('SCHOOL').sort()).toEqual(['CLINIC', 'FOREST', 'VO']);
    expect(byId.SMS!.reach('SCHOOL')).toHaveLength(NODE_IDS.length - 1);
    expect(byId.MOBILE_DATA!.reach('SCHOOL')).toContain('FORD');
    expect(byId.FACE_TO_FACE!.reach('SCHOOL')).toEqual(['SCHOOL']);
  });

  it('shows mesh relay as the ring one road beyond its own reach', () => {
    const byId = Object.fromEntries(REACH_SPECS.map((spec) => [spec.id, spec]));
    const mesh = byId.MESH!;
    expect(mesh.reach('SCHOOL').sort()).toEqual(['BRIDGE_N', 'BRIDGE_S', 'CLINIC', 'FIELD']);
    // Two roads out: reachable only because somebody stands in the gap. BRIDGE_N is
    // one road from SCHOOL because the bridge span is free, so it is direct, not relay.
    expect(mesh.relay!('SCHOOL').sort()).toEqual(['FORD', 'VO']);
    expect(mesh.relay!('SCHOOL').some((node) => mesh.reach('SCHOOL').includes(node))).toBe(false);
  });

  it('gives the Student unaided what mesh otherwise needs a relay for', () => {
    const byId = Object.fromEntries(REACH_SPECS.map((spec) => [spec.id, spec]));
    const student = byId.MESH_STUDENT!.reach('SCHOOL');
    for (const node of [...byId.MESH!.reach('SCHOOL'), ...byId.MESH!.relay!('SCHOOL')]) {
      expect(student).toContain(node);
    }
    expect(byId.MESH_STUDENT!.relay).toBeUndefined();
  });

  it('lets the reader walk the vantage only on the two methods reach follows them on', () => {
    const movable = REACH_SPECS.filter((spec) => spec.movable).map((spec) => spec.id);
    expect(movable).toEqual(['WALKIE', 'MESH']);
    for (const spec of REACH_SPECS) expect(spec.movable && spec.origin).toBeFalsy();
  });

  it('sees every open node from the high ground and no enclosed one', () => {
    const byId = Object.fromEntries(REACH_SPECS.map((spec) => [spec.id, spec]));
    const sight = byId.HIGH_GROUND!;
    expect(sight.origin).toBe('SHRINE');
    const seen = sight.reach('SHRINE');
    expect(seen).not.toContain('SHRINE');
    for (const node of NODE_IDS) {
      if (node === 'SHRINE') continue;
      expect(seen.includes(node)).toBe(MAP_NODES[node].open);
    }
    // The buildings people hide in stay hidden.
    for (const enclosed of ['VO', 'STORE', 'CLINIC', 'COOP', 'FOREST'] as const) {
      expect(seen).not.toContain(enclosed);
    }
  });

  it('broadcasts from the Village Office, not from where the reader stands', () => {
    const byId = Object.fromEntries(REACH_SPECS.map((spec) => [spec.id, spec]));
    const broadcaster = byId.VO_BROADCAST!;
    expect(broadcaster.origin).toBe('VO');
    // Every seat still joined to the Office by road, however far away.
    expect(broadcaster.reach('VO')).toHaveLength(NODE_IDS.length - 1);
  });
});

describe('channel log book', () => {
  it('names what a send was aimed at in the sender\u2019s own terms', () => {
    expect(outboxTarget('2', 'SMS')).toBe('Seat 3');
    expect(outboxTarget('VO', 'LANDLINE')).toBe('Village Office 村辦公處');
    expect(outboxTarget(null, 'WALKIE')).toBe('everyone in range');
    expect(outboxTarget(null, 'FACE_TO_FACE')).toBe('everyone standing here');
    expect(outboxTarget(null, 'VILLAGE_BROADCAST')).toBe('the whole village');
  });
});
