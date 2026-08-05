"use client";

import { Clock3, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Client, type Room } from "colyseus.js";
import type { Card, Rank, Suit } from "../../../lib/games/core/cards";
import type { PickRedPointsPhase } from "../../../lib/games/pick-red-points";
import { PickRedPointsRoomStateSchema, type PublicPickRedPlayer } from "../../../server/schema/PickRedPointsRoomState";
import type { PickRedPointsServerEvent } from "../../../server/messages/pickRedPointsMessages";
import { useBgmMode } from "../../SoundProvider";
import { RoomHeader, RoomOpponentSeat, RoomSelfBadge, RoomTable, UnifiedWaitingRoom } from "../room";

const serverUrl = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "ws://localhost:2567";
const marks: Record<Suit, string> = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" };
const labels: Record<Suit, string> = { clubs: "梅花", diamonds: "方塊", hearts: "紅心", spades: "黑桃" };

export default function RedDotPage() {
  const [state, setState] = useState<PickRedPointsRoomStateSchema | null>(null);
  const [hand, setHand] = useState<Card[]>([]);
  const [roomCode, setRoomCode] = useState("------");
  const [nickname, setNickname] = useState("玩家");
  const [ownId, setOwnId] = useState("");
  const [status, setStatus] = useState("connecting");
  const [message, setMessage] = useState("正在連接遊戲伺服器...");
  const [selectedId, setSelectedId] = useState("");
  const [dealAnimation, setDealAnimation] = useState({ active: false, visible: 0 });
  const [events, setEvents] = useState(0);
  const roomRef = useRef<Room<PickRedPointsRoomStateSchema> | null>(null);
  const hasStartedDealRef = useRef(false);
  useBgmMode(state?.phase === "waiting" || !state ? "lobby" : "playing");

  useEffect(() => {
    let disposed = false;
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode") === "join" ? "join" : "create";
    const requestedRoom = (params.get("room") ?? "").replace(/\D/g, "").slice(0, 6);
    const name = params.get("name")?.trim() || params.get("nickname")?.trim() || "玩家";
    const maxPlayers = Number(params.get("players") ?? 4);
    const bots = Number(params.get("bots") ?? 0);
    const difficulty = params.get("difficulty") ?? "普通";
    const client = new Client(serverUrl);
    setNickname(name);
    async function connect() {
      try {
        const room = mode === "join"
          ? await client.join<PickRedPointsRoomStateSchema>("pick_red_points", { nickname: name, roomCode: requestedRoom, clientId: getTabClientId("red-dot") }, PickRedPointsRoomStateSchema)
          : await client.create<PickRedPointsRoomStateSchema>("pick_red_points", { nickname: name, maxPlayers, bots, difficulty, clientId: getTabClientId("red-dot") }, PickRedPointsRoomStateSchema);
        if (disposed) { await room.leave(); return; }
        roomRef.current = room; setOwnId(`player-${room.sessionId}`); setStatus("connected"); setState(room.state); setRoomCode(room.state.roomCode || room.roomId.slice(0, 6)); setMessage(mode === "join" ? "已加入撿紅點等待室，請切換準備狀態。" : "撿紅點房間已建立，分享房號邀請朋友。");
        room.onStateChange((next) => { setState(next); setRoomCode(next.roomCode || room.roomId.slice(0, 6)); setEvents((value) => value + 1); });
        room.onMessage<PickRedPointsServerEvent>("pick-red-points:event", (event) => { if (event.type === "HAND_UPDATED") { setHand(event.cards); if (!hasStartedDealRef.current && event.cards.length > 0) { hasStartedDealRef.current = true; setDealAnimation({ active: true, visible: 0 }); } setSelectedId((current) => event.cards.some((card) => card.id === current) ? current : event.cards[0]?.id ?? ""); } if (event.type === "STATE_EVENT") setMessage(event.message); if (event.type === "ACTION_REJECTED") setMessage(event.reason); if (event.type === "ROOM_CLOSED") window.location.href = "/"; });
        room.onError((_code, error) => { setStatus("error"); setMessage(error ?? "連線發生錯誤"); });
      } catch (error) { setStatus("error"); setMessage(error instanceof Error ? error.message : "無法加入撿紅點房間"); }
    }
    connect();
    return () => { disposed = true; roomRef.current?.leave(); roomRef.current = null; };
  }, []);

  useEffect(() => {
    if (!dealAnimation.active) return;
    if (dealAnimation.visible >= hand.length) {
      setDealAnimation({ active: false, visible: hand.length });
      return;
    }
    const timer = window.setTimeout(() => {
      setDealAnimation((current) => ({ ...current, visible: Math.min(hand.length, current.visible + 1) }));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [dealAnimation.active, dealAnimation.visible, hand.length]);

  const players = useMemo(() => Array.from(state?.players ?? []) as PublicPickRedPlayer[], [state, events]);
  const own = players.find((player) => player.id === ownId);
  const isHost = own?.host ?? false;
  const phase = (state?.phase ?? "waiting") as PickRedPointsPhase;
  const currentPlayer = players.find((player) => player.id === state?.currentPlayerId);
  const targetIds = new Set((state?.legalTargetIds ?? "").split(",").filter(Boolean));
  const isMyTurn = state?.currentPlayerId === ownId;
  const selectedCard = hand.find((card) => card.id === selectedId);
  const countdown = Math.max(0, Math.ceil(((state?.targetDeadline || state?.turnDeadline || 0) - Date.now()) / 1000));

  function send(type: string, data: Record<string, unknown> = {}) { roomRef.current?.send(type, { type, actionId: `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`, ...data }); }
  function leaveRoom() { send("CLOSE_ROOM"); window.setTimeout(() => { window.location.href = "/"; }, 120); }
  function playSelected() { if (selectedCard && isMyTurn && phase === "playing-hand") send("PLAY_HAND_CARD", { cardId: selectedCard.id }); }
  function chooseTarget(targetCardId: string) { if (isMyTurn && targetIds.has(targetCardId)) send("SELECT_CAPTURE_TARGET", { targetCardId, pendingSource: state?.phase === "selecting-draw-target" ? "draw" : "hand" }); }

  if (phase === "waiting") return <UnifiedWaitingRoom
    gameName="撿紅點"
    roomCode={roomCode}
    status={status}
    statusText={message}
    players={players.map((player) => ({ id: player.id, seat: player.seat, nickname: player.nickname, host: player.host, ready: player.ready, type: player.type }))}
    maxPlayers={state?.maxPlayers ?? 4}
    ownId={ownId}
    isHost={isHost}
    canUseRoom={status === "connected" && !!roomRef.current}
    canStart={players.length >= 2 && players.every((player) => player.ready)}
    allowBots
    minPlayers={2}
    onReady={() => send("SET_READY", { ready: !players.find((player) => player.id === ownId)?.ready })}
    onAddBot={() => send("ADD_BOT", { difficulty: "normal" })}
    onStart={() => send("START_GAME")}
    onLeave={leaveRoom}
  />;

  return (
    <main className="red-dot-page">
      <RedDotHeader roomCode={roomCode} round={state?.round ?? 1} onLeave={leaveRoom} />
      <RoomTable gameName="撿紅點" className="red-dot-board">
        <OpponentCard player={players.find((player) => player.seat === 1)} position="top" current={state?.currentPlayerId === players.find((player) => player.seat === 1)?.id} />
        <OpponentCard player={players.find((player) => player.seat === 2)} position="left" current={state?.currentPlayerId === players.find((player) => player.seat === 2)?.id} />
        <OpponentCard player={players.find((player) => player.seat === 3)} position="right" current={state?.currentPlayerId === players.find((player) => player.seat === 3)?.id} />

        <div className="red-dot-center">
          <div className="red-score-box"><span>目前</span><strong>{own?.score ?? 0}</strong><em>分</em></div>
          <div className="red-dot-status" aria-live="polite"><strong>{isMyTurn ? "輪到你了" : `等待 ${currentPlayer?.nickname ?? "玩家"}`}</strong><span>{message}</span></div>
          <div className="red-dot-table-cards" aria-label="桌面牌">
            {Array.from(state?.tableCards ?? []).map((tableCard) => <button className={`red-card table-card ${targetIds.has(tableCard.id) ? "target" : ""}`} key={tableCard.id} type="button" onClick={() => chooseTarget(tableCard.id)} aria-label={`${labels[tableCard.suit as Suit]}${tableCard.rank}桌牌`}>{cardContent(tableCard.rank as Rank, tableCard.suit as Suit)}</button>)}
          </div>
          <div className="red-pile"><div className="red-card-back">鬥陣</div><strong>牌堆 {state?.drawPileCount ?? 0} 張</strong></div>
          <div className="red-equation">{selectedCard ? `${selectedCard.rank} + 配對桌牌` : "選擇手牌開始配對"}</div>
        </div>

        {dealAnimation.active && dealAnimation.visible < hand.length ? (
          <div className="deal-animation-card red-dot-deal-animation-card" aria-hidden="true"><div className="red-card-back">鬥陣</div></div>
        ) : null}

        <div className="red-dot-self">
          <RoomSelfBadge nickname={nickname || "我"} active={isMyTurn} count={hand.length} />
          <div className="red-dot-hand" aria-label="自己的手牌">{(dealAnimation.active ? hand.slice(0, dealAnimation.visible) : hand).map((card) => <button className={`red-card hand-card ${card.id === selectedId ? "selected" : ""}`} key={card.id} type="button" onClick={() => setSelectedId(card.id)} aria-pressed={card.id === selectedId} aria-label={`${labels[card.suit]}${card.rank}手牌`}>{cardContent(card.rank, card.suit)}</button>)}</div>
          <div className="red-dot-instruction">選一張手牌，再選桌牌配對</div>
        </div>
        <div className="red-dot-actions"><div className="red-countdown"><Clock3 size={20} />{countdown || "--"} 秒</div><button className="red-confirm" type="button" onClick={playSelected} disabled={!selectedCard || !isMyTurn || phase !== "playing-hand"}><Play size={22} />確認出牌</button></div>
      </RoomTable>
    </main>
  );
}

function RedDotHeader({ roomCode, round, onLeave }: { roomCode: string; round: number; onLeave: () => void }) { return <RoomHeader gameName="撿紅點" roomCode={roomCode} round={round} status="connected" docsHref="/docs/games/pick-red-points.md" onLeave={onLeave} />; }
function OpponentCard({ player, position, current }: { player?: PublicPickRedPlayer; position: "top" | "left" | "right"; current: boolean }) {
  if (!player) return null;
  return <RoomOpponentSeat player={{ id: player.id, nickname: player.nickname, cardsRemaining: player.cardsRemaining, type: player.type, connected: player.connected }} position={position} active={current} />;
}
function cardContent(rank: Rank, suit: Suit) { return <><span>{rank}</span><em>{marks[suit]}</em></>; }
function getTabClientId(game: string) { const key = `poker:${game}:client-id`; const existing = window.sessionStorage.getItem(key); if (existing) return existing; const id = `${game}-${crypto.randomUUID()}`; window.sessionStorage.setItem(key, id); return id; }
