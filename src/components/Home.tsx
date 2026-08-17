import { useState } from 'react';
import { createAndClaim } from '../lobby/client';
import { localIdentity } from '../lobby/identity';
import { TrialNotice } from './TrialNotice';

export function Home() {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function createGame() {
    setBusy(true);
    setError('');
    try {
      const { matchID, seat } = await createAndClaim(name);
      localIdentity.set(matchID, seat);
      window.location.assign(`/play/${matchID}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create the game.');
      setBusy(false);
    }
  }

  return (
    <main className="home">
      <section className="hero panel">
        <p className="eyebrow">A four-player communication survival POC</p>
        <h1>BLACKOUT</h1>
        <p>
          Seven days. Broken connections. One shared plan—and private fragments of the truth.
        </p>
        <TrialNotice />
        <label>
          Your name
          <input
            aria-label="Your name"
            autoComplete="name"
            maxLength={24}
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </label>
        <button disabled={busy} onClick={() => void createGame()}>
          {busy ? 'Creating…' : 'Create game'}
        </button>
        {error && <p className="error" role="alert">{error}</p>}
      </section>
    </main>
  );
}
