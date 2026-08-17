import type { LobbyAPI } from 'boardgame.io';
import { Client } from 'boardgame.io/react';
import { SocketIO } from 'boardgame.io/multiplayer';
import type { Game } from 'boardgame.io';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { GAME_NAME, PLAYER_COUNT } from '../constants';
import { BlackoutGame } from '../game/game';
import { claimFirstFree, lobbyClient, validateIdentity } from '../lobby/client';
import { localIdentity, type SeatIdentity } from '../lobby/identity';
import type { PlayerViewState } from '../types';
import { PlanningBoard } from './PlanningBoard';
import { SettingPremise } from './SettingPremise';
import { TrialNotice } from './TrialNotice';

type Match = LobbyAPI.Match;

export function MatchPage({ matchID }: { matchID: string }) {
  const [match, setMatch] = useState<Match | null>(null);
  const [identity, setIdentity] = useState<SeatIdentity | null>(() => localIdentity.get(matchID));
  const [identityValidated, setIdentityValidated] = useState(false);
  const [name, setName] = useState('');
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const next = await lobbyClient.getMatch(GAME_NAME, matchID);
      const stored = localIdentity.get(matchID);
      if (stored) {
        const seat = next.players.find((player) => String(player.id) === stored.playerID);
        if (seat?.name !== stored.name) {
          localIdentity.clear(matchID);
          setIdentity(null);
          setIdentityValidated(false);
        } else {
          const validation = await validateIdentity(matchID, stored);
          if (validation === 'VALID') {
            setIdentity(stored);
            setIdentityValidated(true);
          } else {
            localIdentity.clear(matchID);
            setIdentity(null);
            setIdentityValidated(false);
            if (validation === 'NOT_FOUND') throw new Error('MATCH_NOT_FOUND');
          }
        }
      } else {
        setIdentity(null);
        setIdentityValidated(false);
      }
      setMatch(next);
      setLoadError('');
    } catch {
      setMatch(null);
      setLoadError('This game does not exist or is no longer available.');
    }
  }, [matchID]);

  const occupied = match?.players.filter((player) => player.name).length ?? 0;
  const lobbyComplete = occupied === PLAYER_COUNT;

  useEffect(() => {
    void refresh();
    if (lobbyComplete) return;
    const timer = window.setInterval(() => void refresh(), 1_000);
    return () => window.clearInterval(timer);
  }, [lobbyComplete, refresh]);

  const readyForSocket = lobbyComplete && identity && identityValidated;
  const GameClient = useMemo(() => Client({
    game: BlackoutGame as unknown as Game<PlayerViewState>,
    board: PlanningBoard,
    multiplayer: SocketIO({ server: '' }),
    numPlayers: PLAYER_COUNT,
    debug: false,
  }), []);

  async function join() {
    setActionError('');
    try {
      const seat = await claimFirstFree(matchID, name);
      localIdentity.set(matchID, seat);
      setIdentity(seat);
      await refresh();
    } catch (reason) {
      await refresh();
      setActionError(reason instanceof Error ? reason.message : 'Could not join the game.');
    }
  }

  async function leave() {
    if (!identity || occupied === PLAYER_COUNT) return;
    setActionError('');
    await lobbyClient.leaveMatch(GAME_NAME, matchID, {
      playerID: identity.playerID,
      credentials: identity.credentials,
    });
    localIdentity.clear(matchID);
    setIdentity(null);
    setIdentityValidated(false);
    await refresh();
  }

  if (readyForSocket) {
    return <GameClient matchID={matchID} playerID={identity.playerID} credentials={identity.credentials} />;
  }

  const fullWithoutSeat = occupied === PLAYER_COUNT && !identity;
  const invite = `${window.location.origin}/play/${matchID}`;
  return (
    <main className="home">
      <section className="panel lobby">
        <p className="eyebrow">Waiting room · {occupied}/4 seats</p>
        <h1>Gather your group</h1>
        <SettingPremise />
        <TrialNotice />
        <label>Invite link<input aria-label="Invite link" readOnly value={invite} /></label>
        <button onClick={() => void navigator.clipboard.writeText(invite)}>Copy invite link</button>
        <ol>
          {match?.players.map((player) => <li key={player.id}>{player.name || 'Open seat'}</li>)}
        </ol>
        {!identity && !fullWithoutSeat && (
          <>
            <label>Your name<input aria-label="Your name" maxLength={24} value={name} onChange={(event) => setName(event.target.value)} /></label>
            <button className="primary" onClick={() => void join()}>Join first free seat</button>
          </>
        )}
        {identity && <button className="quiet" onClick={() => void leave()}>Leave seat</button>}
        {fullWithoutSeat && <p role="alert">This game is already in progress. Spectator access is not available.</p>}
        {(actionError || loadError) && (
          <p className="error" role="alert">{actionError || loadError}</p>
        )}
      </section>
    </main>
  );
}
