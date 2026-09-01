import type { BoardProps } from 'boardgame.io/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CHARACTER_LABELS, METHOD_LABELS } from '../constants';
import { METHOD_SPECS, type SendRequest } from '../game/comms';
import { MAP_NODES, NODE_IDS } from '../game/map';
import type { DeliveryMethodId, Inventory, NodeId, PlayerID, PlayerViewState } from '../types';
import { METHOD_SHORT } from './methodDisplay';

type Props = Pick<BoardProps<PlayerViewState>, 'G' | 'moves' | 'playerID'>;

export function sendAcknowledgementText(
  lastSend: NonNullable<PlayerViewState['you']>['lastSend'],
): string {
  if (!lastSend) return '';
  if (lastSend.state === 'sent') return 'Sent. Delivery is unknown.';
  return lastSend.recipientCount > 0
    ? `Delivered face-to-face to ${lastSend.recipientCount} ${lastSend.recipientCount === 1 ? 'person' : 'people'}.`
    : 'No one received the face-to-face message.';
}

/** What the acknowledgement means, spelled out so "sent" is never read as "landed". */
export function receiptDetail(
  lastSend: NonNullable<PlayerViewState['you']>['lastSend'],
): string {
  if (!lastSend) return '';
  if (lastSend.state === 'sent') {
    return 'Whether anyone heard it is not something the game will tell you.';
  }
  return lastSend.recipientCount > 0
    ? 'Face to face is the only channel that confirms delivery.'
    : 'You are alone, so the message reached nobody. Face to face is the only channel that will ever tell you this.';
}

export function CommsPanel({ G, moves, playerID }: Props) {
  const you = G.you!;
  const [method, setMethod] = useState<DeliveryMethodId>('FACE_TO_FACE');
  const [targetPlayer, setTargetPlayer] = useState<PlayerID>(playerID === '0' ? '1' : '0');
  const [targetNode, setTargetNode] = useState<NodeId>('VO');
  const [text, setText] = useState('');
  const [sendState, setSendState] = useState('');
  const [pendingSequence, setPendingSequence] = useState<number | null>(null);
  const refusalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [gift, setGift] = useState<Inventory>({ food: 0, battery: 0 });
  const [giftTarget, setGiftTarget] = useState<PlayerID>(playerID === '0' ? '1' : '0');

  const methods: DeliveryMethodId[] = [...you.methods, 'FACE_TO_FACE'];
  const spec = METHOD_SPECS[method];
  const target = spec.target === 'PLAYER' ? targetPlayer : spec.target === 'NODE' ? targetNode : null;
  const length = Array.from(text).length;
  const cap = spec.payloadCap;
  const over = cap !== null && length > cap;
  const status = method === 'FACE_TO_FACE' ? { available: true, reason: undefined } : G.methodConnectivity[method];
  const blockedReason = method === 'BULLETIN'
    ? 'Bulletin notices are pinned at the board you stand on — use Local facilities.'
    : status?.available ? '' : status?.reason ?? 'Unavailable today.';
  const canSend = Boolean(status?.available) && text.trim().length > 0 && method !== 'BULLETIN';
  const playerOptions = useMemo(
    () => (['0', '1', '2', '3'] as PlayerID[]).filter((id) => id !== playerID),
    [playerID],
  );

  useEffect(() => {
    if (pendingSequence === null || you.lastSend?.sequence !== pendingSequence) return;
    if (refusalTimer.current) clearTimeout(refusalTimer.current);
    refusalTimer.current = null;
    setSendState(sendAcknowledgementText(you.lastSend));
    setText('');
    setPendingSequence(null);
  }, [pendingSequence, you.lastSend]);

  useEffect(() => () => {
    if (refusalTimer.current) clearTimeout(refusalTimer.current);
  }, []);

  function send() {
    const request: SendRequest = { method, target, text };
    const expectedSequence = (you.lastSend?.sequence ?? 0) + 1;
    setPendingSequence(expectedSequence);
    setSendState('Sending…');
    if (refusalTimer.current) clearTimeout(refusalTimer.current);
    refusalTimer.current = setTimeout(() => {
      setPendingSequence((pending) => {
        if (pending !== expectedSequence) return pending;
        setSendState('Send refused or not acknowledged. Check the method requirements and try again.');
        return null;
      });
      refusalTimer.current = null;
    }, 2500);
    moves.sendMessage!(request);
  }

  const refused = sendState.startsWith('Send refused');
  const receiptTone = refused ? 'bad' : sendState === 'Sending…' ? 'pending' : 'good';

  return (
    <div className="composer">
      <div className="method-chips" role="group" aria-label="Method">
        {methods.map((id) => {
          const chipStatus = id === 'FACE_TO_FACE' ? { available: true } : G.methodConnectivity[id];
          const unavailable = !chipStatus?.available || id === 'BULLETIN';
          return (
            <button
              aria-pressed={id === method}
              key={id}
              onClick={() => { setMethod(id); setSendState(''); }}
              title={id === 'FACE_TO_FACE' ? 'Face to face' : METHOD_LABELS[id]}
              type="button"
            >
              {METHOD_SHORT[id]}{unavailable ? ' ✕' : ''}
            </button>
          );
        })}
      </div>

      {spec.target === 'PLAYER' && (
        <label>Recipient
          <select onChange={(event) => setTargetPlayer(event.target.value as PlayerID)} value={targetPlayer}>
            {playerOptions.map((id) => (
              <option key={id} value={id}>
                Seat {Number(id) + 1} · {CHARACTER_LABELS[G.publicPlayers[id]!.character]}
              </option>
            ))}
          </select>
        </label>
      )}
      {method === 'LANDLINE' && (
        <label>Call node
          <select onChange={(event) => setTargetNode(event.target.value as NodeId)} value={targetNode}>
            {NODE_IDS.filter((node) => MAP_NODES[node].landline).map((node) => (
              <option key={node} value={node}>{MAP_NODES[node].label}</option>
            ))}
          </select>
        </label>
      )}

      <div className="composer-box">
        <textarea
          aria-label="Message"
          onChange={(event) => setText(event.target.value)}
          placeholder={G.commsPlan.reportingShorthand ? 'FORD 2 3 TEA' : 'Say where you are and what you need.'}
          value={text}
        />
        <div className="composer-meter">
          <span className={over ? 'over' : undefined}>
            {cap === null
              ? `${length} characters · no limit`
              : `${length} / ${cap}${over ? ' — the rest is cut in transit' : ' characters'}`}
          </span>
          <span>{blockedReason ? '—' : method === 'FACE_TO_FACE' ? 'Free · same node only' : 'Costs battery'}</span>
        </div>
      </div>

      {blockedReason && <p className="hint warn">✕ {blockedReason}</p>}

      <button
        className="primary"
        disabled={!canSend || pendingSequence !== null}
        onClick={send}
      >
        {canSend ? 'SEND' : blockedReason ? 'CHANNEL UNAVAILABLE' : 'WRITE SOMETHING FIRST'}
      </button>

      {sendState && (
        <div className={`receipt ${receiptTone}`} role="status">
          <p className="receipt-title">{sendState}</p>
          {!refused && sendState !== 'Sending…' && <p className="receipt-body">{receiptDetail(you.lastSend)}</p>}
        </div>
      )}

      <details className="exchange">
        <summary>Exchange items here</summary>
        <label>Give to
          <select onChange={(event) => setGiftTarget(event.target.value as PlayerID)} value={giftTarget}>
            {playerOptions.map((id) => <option key={id} value={id}>Seat {Number(id) + 1}</option>)}
          </select>
        </label>
        <div className="resource-pair">
          <label>Food<input min="0" onChange={(event) => setGift({ ...gift, food: Number(event.target.value) })} type="number" value={gift.food} /></label>
          <label>Battery<input min="0" onChange={(event) => setGift({ ...gift, battery: Number(event.target.value) })} type="number" value={gift.battery} /></label>
        </div>
        <button className="quiet" onClick={() => moves.exchange!(giftTarget, gift)}>Give immediately</button>
      </details>
    </div>
  );
}
