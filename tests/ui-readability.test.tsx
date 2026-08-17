import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CHARACTER_ABILITY_TEXT, CharacterAbility } from '../src/components/CharacterAbility';
import { sendAcknowledgementText } from '../src/components/CommsPanel';
import { DayStamp } from '../src/components/DayStamp';
import { clearableEdgesAt, mapLabelLines } from '../src/components/GameBoard';
import { CHARACTER_IDS } from '../src/constants';
import { edgeKey } from '../src/game/map';

describe('authoritative communication feedback', () => {
  it('does not imply remote delivery and distinguishes an empty face-to-face audience', () => {
    expect(sendAcknowledgementText({ sequence: 1, day: 2, state: 'sent' }))
      .toBe('Sent. Delivery is unknown.');
    expect(sendAcknowledgementText({ sequence: 2, day: 2, state: 'delivered', recipientCount: 0 }))
      .toBe('No one received the face-to-face message.');
    expect(sendAcknowledgementText({ sequence: 3, day: 2, state: 'delivered', recipientCount: 2 }))
      .toBe('Delivered face-to-face to 2 people.');
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

  it('wraps long bilingual map labels into compact readable lines', () => {
    expect(mapLabelLines('Suspension Bridge North 吊橋北端'))
      .toEqual(['Suspension', 'Bridge North', '吊橋北端']);
    expect(mapLabelLines('School 國小')).toEqual(['School', '國小']);
  });
});
