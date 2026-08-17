import type { BoardProps } from 'boardgame.io/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { METHOD_LABELS } from '../constants';
import { METHOD_SPECS, type SendRequest } from '../game/comms';
import { MAP_NODES, NODE_IDS } from '../game/map';
import type { DeliveryMethodId, Inventory, NodeId, PlayerID, PlayerViewState } from '../types';

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
  const status = method === 'FACE_TO_FACE'
    ? { available: true }
    : G.methodConnectivity[method];
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

  return (
    <section className="panel comms-panel">
      <p className="eyebrow">Comms</p>
      <label>Method<select value={method} onChange={(event) => { setMethod(event.target.value as DeliveryMethodId); setSendState(''); }}>
        {methods.map((id) => {
          const methodStatus = id === 'FACE_TO_FACE' ? { available: true } : G.methodConnectivity[id];
          const label = id === 'FACE_TO_FACE' ? 'Face-to-face' : METHOD_LABELS[id];
          return <option disabled={!methodStatus?.available || id === 'BULLETIN'} key={id} value={id}>{label}{!methodStatus?.available ? ` — ${methodStatus?.reason}` : id === 'BULLETIN' ? ' — use the local board' : ''}</option>;
        })}
      </select></label>
      {spec.target === 'PLAYER' && <label>Recipient<select value={targetPlayer} onChange={(event) => setTargetPlayer(event.target.value as PlayerID)}>{playerOptions.map((id) => <option key={id} value={id}>Seat {Number(id) + 1}</option>)}</select></label>}
      {method === 'LANDLINE' && <label>Call node<select value={targetNode} onChange={(event) => setTargetNode(event.target.value as NodeId)}>{NODE_IDS.filter((node) => MAP_NODES[node].landline).map((node) => <option key={node} value={node}>{MAP_NODES[node].label}</option>)}</select></label>}
      <label>Message<textarea aria-label="Message" value={text} onChange={(event) => setText(event.target.value)} /></label>
      <p className={spec.payloadCap !== null && length > spec.payloadCap ? 'over-cap' : 'counter'}>{length}{spec.payloadCap === null ? ' characters' : ` / ${spec.payloadCap} characters (extra text is truncated)`}</p>
      <button disabled={!canSend || pendingSequence !== null} onClick={send}>Send</button>
      {sendState && <p className={sendState.startsWith('Send refused') ? 'action-status refused' : 'action-status'} role="status">{sendState}</p>}

      <details>
        <summary>Exchange items here</summary>
        <label>Give to<select value={giftTarget} onChange={(event) => setGiftTarget(event.target.value as PlayerID)}>{playerOptions.map((id) => <option key={id} value={id}>Seat {Number(id) + 1}</option>)}</select></label>
        <div className="resource-pair"><label>Food<input min="0" type="number" value={gift.food} onChange={(event) => setGift({ ...gift, food: Number(event.target.value) })} /></label><label>Battery<input min="0" type="number" value={gift.battery} onChange={(event) => setGift({ ...gift, battery: Number(event.target.value) })} /></label></div>
        <button onClick={() => moves.exchange!(giftTarget, gift)}>Give immediately</button>
      </details>

    </section>
  );
}
