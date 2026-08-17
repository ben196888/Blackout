import { describe, expect, it } from 'vitest';
import { BALANCE, CHARACTER_IDS } from '../src/constants';
import { METHOD_SPECS } from '../src/game/comms';
import { MAP_NODES } from '../src/game/map';
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
        expect(player.inventory).toEqual(BALANCE.startingInventory.STORE_OWNER);
      }
    }
  });

  it('routes every M7 balance category through the constants tuning surface', () => {
    expect(MAP_NODES.STORE.cache).toEqual(BALANCE.mapSupply.STORE);
    expect(METHOD_SPECS.SMS.payloadCap).toBe(BALANCE.payloadCap.SMS);
    expect(METHOD_SPECS.MOBILE_VOICE.availability[1]?.dropRate)
      .toBe(BALANCE.dropRate.MOBILE_VOICE_DAY_1);
    expect(METHOD_SPECS.MESH.batteryPerSends)
      .toBe(BALANCE.communicationPrice.MESH_SENDS_PER_BATTERY);
    expect(BALANCE.startingInventory.STORE_OWNER.food + BALANCE.startingInventory.STORE_OWNER.battery)
      .toBeLessThanOrEqual(BALANCE.capacity.DEFAULT);
    expect(BALANCE.scavengeYield.OFFICE_WORKER).toBeGreaterThan(BALANCE.scavengeYield.DEFAULT);
  });

  it('keeps tuned values inside valid mechanical ranges', () => {
    expect(Object.values(BALANCE.dropRate).every((rate) => rate >= 0 && rate <= 1)).toBe(true);
    expect(Object.values(BALANCE.payloadCap).every((cap) => Number.isInteger(cap) && cap >= 0)).toBe(true);
    expect(Object.values(BALANCE.scavengeYield).every((yieldValue) =>
      Number.isInteger(yieldValue) && yieldValue > 0)).toBe(true);
    expect(BALANCE.communicationPrice.MESH_SENDS_PER_BATTERY).toBeGreaterThan(0);
    expect(BALANCE.communicationPrice.WALKIE_SENDS_PER_BATTERY).toBeGreaterThan(0);
    expect(BALANCE.communicationPrice.INFRASTRUCTURE_FIRST_USE).toBeGreaterThanOrEqual(0);
    expect(BALANCE.communicationPrice.RADIO_NIGHTLY).toBeGreaterThanOrEqual(0);
    expect(BALANCE.communicationPrice.DAY_5_MULTIPLIER).toBeGreaterThanOrEqual(1);
  });
});
