"use client";

import { BookOpen, Bot, CheckCircle2, Clock3, Crown, LogOut, Play, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Client, type Room } from "colyseus.js";
import type { Card, Rank, Suit } from "../../../lib/games/core/cards";
import type { PickRedPointsPhase } from "../../../lib/games/pick-red-points";
import { PickRedPointsRoomStateSchema, type PublicPickRedPlayer } from "../../../server/schema/PickRedPointsRoomState";
import type { PickRedPointsServerEvent } from "../../../server/messages/pickRedPointsMessages";
import { useBgmMode } from "../../SoundProvider";

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

  if (phase === "waiting") return <WaitingRoom state={state} players={players} ownId={ownId} isHost={isHost} roomCode={roomCode} status={status} message={message} onSend={send} onLeave={leaveRoom} />;

  return (
    <main className="red-dot-page">
      <RedDotHeader roomCode={roomCode} round={state?.round ?? 1} onLeave={leaveRoom} />
      <section className="red-dot-board" aria-label="撿紅點牌桌">
        <div className="red-dot-opponent red-top"><OpponentCard player={players.find((player) => player.seat === 1)} current={state?.currentPlayerId === players.find((player) => player.seat === 1)?.id} /></div>
        <div className="red-dot-opponent red-left"><OpponentCard player={players.find((player) => player.seat === 2)} current={state?.currentPlayerId === players.find((player) => player.seat === 2)?.id} /></div>
        <div className="red-dot-opponent red-right"><OpponentCard player={players.find((player) => player.seat === 3)} current={state?.currentPlayerId === players.find((player) => player.seat === 3)?.id} /></div>

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
          <div className="self-info"><div className="text-avatar blue">{(nickname || "我").slice(0, 1)}</div><div><strong>{nickname}</strong><span>我的牌 {hand.length} 張 · {own?.score ?? 0} 分</span></div></div>
          <div className="red-dot-hand" aria-label="自己的手牌">{(dealAnimation.active ? hand.slice(0, dealAnimation.visible) : hand).map((card) => <button className={`red-card hand-card ${card.id === selectedId ? "selected" : ""}`} key={card.id} type="button" onClick={() => setSelectedId(card.id)} aria-pressed={card.id === selectedId} aria-label={`${labels[card.suit]}${card.rank}手牌`}>{cardContent(card.rank, card.suit)}</button>)}</div>
          <div className="red-dot-instruction">選一張手牌，再選桌牌配對</div>
        </div>
        <div className="red-dot-actions"><div className="red-countdown"><Clock3 size={20} />{countdown || "--"} 秒</div><button className="red-confirm" type="button" onClick={playSelected} disabled={!selectedCard || !isMyTurn || phase !== "playing-hand"}><Play size={22} />確認出牌</button></div>
      </section>
    </main>
  );
}

function WaitingRoom({ state, players, ownId, isHost, roomCode, status, message, onSend, onLeave }: { state: PickRedPointsRoomStateSchema | null; players: PublicPickRedPlayer[]; ownId: string; isHost: boolean; roomCode: string; status: string; message: string; onSend: (type: string, data?: Record<string, unknown>) => void; onLeave: () => void }) {
  const ownReady = players.find((player) => player.id === ownId)?.ready ?? false;
  const emptySeats = Math.max(0, (state?.maxPlayers ?? 4) - players.length);
  return <main className="heart-auto-shell ninety-online-shell"><RedDotHeader roomCode={roomCode} round={state?.round ?? 1} onLeave={onLeave} /><section className="heart-waiting-room ninety-waiting-room"><div className="waiting-room-title"><span className="stamp">等待室</span><h1>撿紅點 房間</h1></div><div className="waiting-room-code"><span>{formatRoom(roomCode)}</span><button type="button" onClick={() => navigator.clipboard?.writeText(roomCode)}>複製房號</button></div><div className="heart-lobby-list ninety-lobby-list">{players.map((player) => <article className={`heart-lobby-seat ${player.ready ? "ready" : ""}`} key={player.id}><span className="lobby-card-corner">{player.nickname.slice(0, 1)}</span><span>座位 {player.seat + 1}{player.host ? " · 房主" : ""}</span><strong>{player.nickname}{player.id === ownId ? "（你）" : ""}</strong><em>{player.type === "bot" ? "電腦玩家" : "真人玩家"}</em><b>{player.ready ? "已準備" : "未準備"}</b></article>)}{Array.from({ length: emptySeats }).map((_, index) => <article className="heart-lobby-seat lobby-empty-seat" key={`empty-${index}`} aria-label={`座位 ${players.length + index + 1} 等待玩家`}><span className="empty-seat-icon" aria-hidden="true">♙</span><strong>等待玩家</strong><em>空位</em></article>)}</div><div className="heart-lobby-actions"><button className={`ready-button ${ownReady ? "is-ready" : ""}`} type="button" onClick={() => onSend("SET_READY", { ready: !ownReady })}><CheckCircle2 size={22} />{ownReady ? "取消準備" : "我準備好了"}</button>{isHost && <><button className="ready-button bot-button" type="button" onClick={() => onSend("ADD_BOT", { difficulty: "普通" })} disabled={players.length >= (state?.maxPlayers ?? 4)}><Bot size={22} />加電腦補位</button><button className="play-card-button compact-action" type="button" onClick={() => onSend("START_GAME")} disabled={players.length < 2 || !players.every((player) => player.ready)}><Play size={20} />開始遊戲</button></>}</div><p className={`connection-note ${status}`}>{message}</p></section></main>;
}

function RedDotHeader({ roomCode, round, onLeave }: { roomCode: string; round: number; onLeave: () => void }) { return <header className="game-topbar image-style"><a className="table-logo sticker-logo" href="/" aria-label="回到首頁">鬥陣</a><div className="table-title-pack inline-title"><h2>撿紅點</h2></div><div className="table-meta"><span>房號 <b>{formatRoom(roomCode)}</b></span><span>第 <b>{round}</b> 局</span></div><div className="topbar-actions"><a href="/docs/games/pick-red-points.md"><BookOpen size={19} />玩法</a><button className="leave" type="button" onClick={onLeave}><LogOut size={19} />離開牌局</button></div></header>; }
function OpponentCard({ player, current }: { player?: PublicPickRedPlayer; current: boolean }) { return <article className={`red-opponent-card ${current ? "active" : ""}`}>{player ? <><div className="text-avatar yellow">{player.nickname.slice(0, 1)}</div><div><strong>{player.nickname}</strong><span>{player.cardsRemaining} 張 · {player.score} 分</span><em>{player.type === "bot" ? "電腦" : "真人"}</em></div></> : <><Users /><strong>等待玩家</strong></>}</article>; }
function cardContent(rank: Rank, suit: Suit) { return <><span>{rank}</span><em>{marks[suit]}</em></>; }
function formatRoom(value: string) { const clean = value.replace(/\D/g, "").slice(0, 6).padEnd(6, "-"); return `${clean.slice(0, 3)} ${clean.slice(3)}`; }
function getTabClientId(game: string) { const key = `poker:${game}:client-id`; const existing = window.sessionStorage.getItem(key); if (existing) return existing; const id = `${game}-${crypto.randomUUID()}`; window.sessionStorage.setItem(key, id); return id; }
