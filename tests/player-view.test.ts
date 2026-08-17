import { describe, expect, it } from 'vitest';
import { playerView } from '../src/game/game';
import { createInitialState } from '../src/game/setup';

const random = { Shuffle: <T,>(items: T[]) => [...items] };

describe('playerView secrecy boundary', () => {
  it('publishes method/readiness booleans but only the owner exact state', () => {
    const truth = createInitialState(random);
    truth.players['1'].inventory = { food: 17, battery: 19 };
    truth.players['1'].location = 'MTNRD';
    truth.players['1'].inbox.push({ day: 1, from: 'SYSTEM', method: 'RADIO', text: 'SECRET_TEXT' });
    truth.players['1'].alive = false;
    truth.players['1'].bulletinNotebook = [{
      id: 'VO:1', board: 'VO', day: 4, author: 'SYSTEM', text: 'Official rendezvous: TEA', official: true,
    }];
    truth.caches.MTNRD = { food: 23, battery: 29 };

    const view = playerView({ G: truth, playerID: '0' });
    expect(view.publicPlayers['1']).toEqual(expect.objectContaining({
      hasFood: true,
      hasBattery: true,
      actionsLeft: 2,
      ready: false,
    }));
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain('MTNRD');
    expect(serialized).not.toContain('SECRET_TEXT');
    expect(serialized).not.toContain('Official rendezvous');
    expect(serialized).not.toContain('"food":17');
    expect(serialized).not.toContain('"alive":false');
    expect(serialized).not.toContain('"food":23');
    expect(view.you?.location).toBe('VO');
  });

  it('gives no private state to an unidentified client', () => {
    const truth = createInitialState(random);
    expect(playerView({ G: truth, playerID: null }).you).toBeNull();
  });
});
