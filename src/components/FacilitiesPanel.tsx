import type { BoardProps } from 'boardgame.io/react';
import { useState } from 'react';
import { BALANCE } from '../constants';
import { MAP_NODES } from '../game/map';
import type { BulletinBoardId, PlayerViewState } from '../types';

type Props = Pick<BoardProps<PlayerViewState>, 'G' | 'moves' | 'playerID'>;

const BOARD_IDS: BulletinBoardId[] = ['VO', 'SCHOOL', 'COOP', 'FOREST'];

export function FacilitiesPanel({ G, moves, playerID }: Props) {
  const you = G.you!;
  const [post, setPost] = useState('');
  const [broadcast, setBroadcast] = useState('');
  const atBoard = BOARD_IDS.includes(you.location as BulletinBoardId);
  const canPost = atBoard && you.methods.includes('BULLETIN');
  const canBroadcast = you.character === 'VILLAGE_LEADER' && you.location === 'VO';
  const broadcastUsed = you.villageBroadcastDay === G.day;
  const ready = G.publicPlayers[playerID as keyof typeof G.publicPlayers].ready;

  return (
    <section className="panel facilities-panel">
      <p className="eyebrow">Local facilities</p>
      <label className="check private-control">
        <input
          checked={you.radioListen}
          disabled={ready}
          onChange={(event) => moves.setRadioListen!(event.target.checked)}
          type="checkbox"
        />
        <span>Listen to the nightly radio (private · costs {BALANCE.communicationPrice.RADIO_NIGHTLY} Battery at night)</span>
      </label>

      {atBoard && <p>You are at the {MAP_NODES[you.location].label} bulletin board.</p>}
      {canPost && <>
        <label>Append a local notice<textarea aria-label="Bulletin notice" value={post} onChange={(event) => setPost(event.target.value)} /></label>
        <button disabled={!post.trim()} onClick={() => { moves.postBulletin!(post); setPost(''); }}>Post to this board</button>
      </>}

      {canBroadcast && <>
        <label>Village Office broadcast<textarea aria-label="Village broadcast" maxLength={BALANCE.payloadCap.VILLAGE_BROADCAST} value={broadcast} onChange={(event) => setBroadcast(event.target.value)} /></label>
        <p className="counter">{Array.from(broadcast).length} / {BALANCE.payloadCap.VILLAGE_BROADCAST} characters · once per day · one-way, no delivery feedback</p>
        {broadcastUsed && <p>Today’s Village Office broadcast has already been used.</p>}
        <button disabled={!broadcast || broadcastUsed} onClick={() => { moves.leaderBroadcast!(broadcast); setBroadcast(''); }}>Broadcast</button>
      </>}
    </section>
  );
}
