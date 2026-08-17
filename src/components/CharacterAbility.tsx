import type { CharacterId } from '../types';

export const CHARACTER_ABILITY_TEXT: Record<CharacterId, string> = {
  VILLAGE_LEADER: 'Can use the Village Office broadcaster for a one-way village broadcast.',
  STUDENT: 'Chooses 5 communication methods. Mesh reaches up to 2 nodes without a relay.',
  OFFICE_WORKER: 'Can scavenge up to 3 items at once and carry up to 12 items.',
  NURSE: 'Uses 1 less Food each night while sharing a location with another living player.',
  RESERVIST: 'Can move up to 2 nodes per action. Walkie-talkie reaches up to 2 nodes.',
  STORE_OWNER: 'Can leave carried items in the local cache and begins with the store stockpile.',
};

export function CharacterAbility({ character }: { character: CharacterId }) {
  return <p className="character-ability"><strong>Ability:</strong> {CHARACTER_ABILITY_TEXT[character]}</p>;
}
