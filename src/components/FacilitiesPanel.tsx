import type { BoardProps } from 'boardgame.io/react';
import { useState } from 'react';
import { BALANCE } from '../constants';
import { MAP_NODES } from '../game/map';
import type { BulletinBoardId, PlayerViewState } from '../types';
import { useToast } from './Toaster';

type Props = Pick<BoardProps<PlayerViewState>, 'G' | 'moves' | 'playerID'>;

const BOARD_IDS: BulletinBoardId[] = ['VO', 'SCHOOL', 'COOP', 'FOREST'];

/** Sits beside Ready for night: the radio is the last call of the evening, not a facility. */
export function RadioCard({ G, moves, playerID }: Props) {
  const you = G.you!;
  const toast = useToast();
  const ready = G.publicPlayers[playerID as keyof typeof G.publicPlayers]!.ready;
  const radioCost = BALANCE.communicationPrice.RADIO_NIGHTLY * (G.day >= 5 ? BALANCE.communicationPrice.DAY_5_MULTIPLIER : 1);

  return (
    <section className="card radio-card">
      <div className="card-head">
        <p className="card-title">Tonight&rsquo;s radio</p>
        <span className="hint">private</span>
      </div>
      <label className="check private-control">
        <input
          aria-label={`Listen to the nightly radio · costs ${radioCost} battery`}
          checked={you.radioListen}
          disabled={ready}
          onChange={(event) => {
            moves.setRadioListen!(event.target.checked);
            toast(event.target.checked ? `Listening tonight · −${radioCost} battery` : 'Not listening tonight', 'info');
          }}
          type="checkbox"
        />
        <span>
          Listen tonight
          <span className="hint" style={{ display: 'block', color: 'var(--signal)' }}>−{radioCost} battery</span>
        </span>
      </label>
      <p className="hint" style={{ marginTop: '.5rem' }}>
        After Day 4 the radio is one of only two places the changed rendezvous is ever spoken.
      </p>
    </section>
  );
}

export function FacilitiesPanel({ G, moves, playerID: _playerID }: Props) {
  const you = G.you!;
  const toast = useToast();
  const [post, setPost] = useState('');
  const [broadcast, setBroadcast] = useState('');
  const atBoard = BOARD_IDS.includes(you.location as BulletinBoardId);
  const canPost = atBoard && you.methods.includes('BULLETIN');
  const canBroadcast = you.character === 'VILLAGE_LEADER' && you.location === 'VO';
  const broadcastUsed = you.villageBroadcastDay === G.day;

  return (
    <>
      {(atBoard || canBroadcast) && (
        <section className="card" data-testid="local-facilities">
          <p className="card-title">Local facilities</p>
          {atBoard && (
            <p className="hint" style={{ margin: '.4rem 0 .6rem' }}>
              You are standing at the {MAP_NODES[you.location].label} bulletin board.
            </p>
          )}
          {canPost && (
            <div className="stack">
              <label>Append a local notice
                <textarea aria-label="Bulletin notice" onChange={(event) => setPost(event.target.value)} value={post} />
              </label>
              <button
                className="quiet"
                disabled={!post.trim()}
                onClick={() => {
                  moves.postBulletin!(post);
                  setPost('');
                  toast(`Pinned to the ${MAP_NODES[you.location].label} board.`);
                }}
              >
                Post to this board
              </button>
            </div>
          )}
          {atBoard && !canPost && (
            <p className="hint warn">You did not claim the bulletin board, so you cannot pin a notice here.</p>
          )}
          {canBroadcast && (
            <div className="stack" style={{ marginTop: '.75rem' }}>
              <label>Village Office broadcast
                <textarea
                  aria-label="Village broadcast"
                  maxLength={BALANCE.payloadCap.VILLAGE_BROADCAST}
                  onChange={(event) => setBroadcast(event.target.value)}
                  value={broadcast}
                />
              </label>
              <p className="counter">
                {Array.from(broadcast).length} / {BALANCE.payloadCap.VILLAGE_BROADCAST} characters · once per day · one-way, no delivery feedback
              </p>
              {broadcastUsed && <p className="hint warn">Today&rsquo;s Village Office broadcast has already been used.</p>}
              <button
                className="quiet"
                disabled={!broadcast || broadcastUsed}
                onClick={() => {
                  moves.leaderBroadcast!(broadcast);
                  setBroadcast('');
                  toast('Broadcast sent. One-way — no delivery feedback.', 'info');
                }}
              >
                Broadcast
              </button>
            </div>
          )}
        </section>
      )}
    </>
  );
}
