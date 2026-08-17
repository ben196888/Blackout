import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS } from '../src/constants';
import { createInitialState } from '../src/game/setup';

const deterministicRandom = {
  Shuffle<T>(items: T[]): T[] {
    return [...items].reverse();
  },
};

describe('initial state', () => {
  it('assigns four unique seeded characters with Village Leader forced in', () => {
    const state = createInitialState(deterministicRandom);
    const characters = Object.values(state.players).map((player) => player.character);
    expect(characters).toHaveLength(4);
    expect(new Set(characters)).toHaveLength(4);
    expect(characters).toContain('VILLAGE_LEADER');
    expect(characters.every((character) => CHARACTER_IDS.includes(character))).toBe(true);
  });

  it('uses fixed seat starts and capacity-safe absolute inventories', () => {
    const state = createInitialState(deterministicRandom);
    expect(Object.values(state.players).map((player) => player.location)).toEqual([
      'VO', 'SCHOOL', 'COOP', 'FOREST',
    ]);
    for (const player of Object.values(state.players)) {
      expect(player.inventory.food + player.inventory.battery).toBeLessThanOrEqual(player.capacity);
      if (player.character === 'STORE_OWNER') {
        expect(player.inventory).toEqual({ food: 6, battery: 4 });
      }
    }
  });
});
