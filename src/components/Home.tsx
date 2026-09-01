import { useState } from 'react';
import { createAndClaim } from '../lobby/client';
import { localIdentity } from '../lobby/identity';
import { SettingPremise } from './SettingPremise';
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
      <section className="hero card">
        <p className="kicker">PACE POC · FOUR SEATS · SEVEN NIGHTS</p>
        <h1>BLACKOUT</h1>
        <p className="lede">
          Four survivors are scattered across a village after a blackout. Each has private
          information, a private inventory, and a limited set of ways to reach the others. You spend
          Day 0 negotiating who covers which method, then live with those choices for seven nights.
        </p>
        <SettingPremise />
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
        <button className="primary" disabled={busy} onClick={() => void createGame()}>
          {busy ? 'CREATING…' : 'CREATE GAME'}
        </button>
        <a className="hud-link" href="/rules">Read the rules first →</a>
        {error && <p className="error" role="alert">{error}</p>}
      </section>
    </main>
  );
}
