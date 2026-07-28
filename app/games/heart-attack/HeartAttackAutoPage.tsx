"use client";

import { AlertTriangle, BookOpen, CheckCircle2, Hand, LogOut, Play, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Client, type Room } from "colyseus.js";
import { HeartAttackRoomStateSchema, type PublicHeartAttackPlayer } from "../../../server/schema/HeartAttackRoomState";
import type { HeartAttackPhase, PenaltyReason, PenaltyResult } from "../../../lib/games/heart-attack";
import type { HeartAttackServerEvent } from "../../../server/messages/heartAttackMessages";

type Suit = "spades" | "hearts" | "diamonds" | "clubs";
type DemoCard = { id: string; rank: string; suit: Suit };
type Seat = "self" | "top" | "left" | "right";
type ThemeColor = "green" | "red" | "purple" | "yellow" | "blue";
type TablePlayer = {
  id: string;
  nickname: string;
  seat: Seat;
  color: ThemeColor;
  cardsRemaining: number;
  connected: boolean;
  ready: boolean;
  type: string;
};
type ConnectionStatus = "connecting" | "connected" | "error" | "closed";

const gameServerUrl = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "ws://localhost:2567";
const seatOrder: Seat[] = ["self", "top", "left", "right"];
const colorOrder: ThemeColor[] = ["yellow", "green", "purple", "red"];
const fallbackPlayers: TablePlayer[] = [
  { id: "self", nickname: "我", seat: "self", color: "yellow", cardsRemaining: 0, connected: true, ready: false, type: "human" },
  { id: "top", nickname: "等待中", seat: "top", color: "green", cardsRemaining: 0, connected: false, ready: false, type: "human" },
  { id: "left", nickname: "等待中", seat: "left", color: "purple", cardsRemaining: 0, connected: false, ready: false, type: "human" },
  { id: "right", nickname: "等待中", seat: "right", color: "red", cardsRemaining: 0, connected: false, ready: false, type: "human" }
];

const suitSymbols: Record<Suit, string> = {
  spades: "S",
  hearts: "H",
  diamonds: "D",
  clubs: "C"
};

const suitClass: Record<Suit, string> = {
  spades: "black",
  clubs: "black",
  hearts: "red",
  diamonds: "red"
};

export default function HeartAttackAutoPage() {
  const [roomCode, setRoomCode] = useState("------");
  const [nickname, setNickname] = useState("玩家");
  const [ownPlayerId, setOwnPlayerId] = useState("");
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [statusText, setStatusText] = useState("正在連接遊戲伺服器...");
  const [roomState, setRoomState] = useState<HeartAttackRoomStateSchema | null>(null);
  const [stateVersion, setStateVersion] = useState(0);
  const [, setEvents] = useState<HeartAttackServerEvent[]>([]);
  const [flyingCard, setFlyingCard] = useState<DemoCard | null>(null);
  const [, setSlapCount] = useState(0);
  const roomRef = useRef<Room<HeartAttackRoomStateSchema> | null>(null);
  const lastCardIdRef = useRef("");

  useEffect(() => {
    let disposed = false;
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode") === "join" ? "join" : "create";
    const requestedRoom = (params.get("room") ?? "").replace(/\D/g, "").slice(0, 6);
    const name = params.get("name")?.trim() || params.get("nickname")?.trim() || "玩家";
    const maxPlayers = Number(params.get("players") ?? 4);
    const client = new Client(gameServerUrl);

    setNickname(name);

    async function connect() {
      try {
        setStatus("connecting");
        setStatusText(mode === "join" ? `正在加入房間 ${requestedRoom}...` : "正在建立私人房間...");

        const room =
          mode === "join"
            ? await client.join<HeartAttackRoomStateSchema>("heart_attack", { nickname: name, roomCode: requestedRoom }, HeartAttackRoomStateSchema)
            : await client.create<HeartAttackRoomStateSchema>("heart_attack", { nickname: name, maxPlayers }, HeartAttackRoomStateSchema);

        if (disposed) {
          await room.leave();
          return;
        }

        roomRef.current = room;
        setOwnPlayerId(`player-${room.sessionId}`);
        setStatus("connected");
        setStatusText(mode === "join" ? "已加入等待室，請切換準備狀態。" : "房間已建立，分享房號邀請朋友。");
        setRoomState(room.state);
        setStateVersion((version) => version + 1);
        setRoomCode(room.state.roomCode || room.roomId.slice(0, 6));

        room.onStateChange((state) => {
          setRoomState(state);
          setStateVersion((version) => version + 1);
          setRoomCode(state.roomCode || room.roomId.slice(0, 6));
          const nextCardId = state.lastCard?.id ?? "";
          if (nextCardId && nextCardId !== lastCardIdRef.current) {
            setFlyingCard(toDemoCard(state.lastCard));
            window.setTimeout(() => setFlyingCard(null), 520);
          }
          lastCardIdRef.current = nextCardId;
        });

        room.onMessage<HeartAttackServerEvent>("heart-attack:event", (event) => {
          setEvents((current) => [event, ...current].slice(0, 8));
          if (event.type === "ACTION_REJECTED") setStatusText(event.reason);
          if (event.type === "ROOM_CLOSED") {
            window.location.href = "/";
          }
        });

        room.onLeave((code) => {
          if (!disposed) {
            setStatus("closed");
            setStatusText(`已離開牌局 (${code})`);
          }
        });

        room.onError((_code, message) => {
          setStatus("error");
          setStatusText(message ?? "連線發生錯誤");
        });
      } catch (error) {
        setStatus("error");
        setStatusText(error instanceof Error ? error.message : "無法建立或加入房間");
      }
    }

    connect();

    return () => {
      disposed = true;
      roomRef.current?.leave();
      roomRef.current = null;
    };
  }, []);

  const rawPlayers = useMemo(() => Array.from(roomState?.players ?? []), [roomState, stateVersion]);
  const players = useMemo(() => mapPlayers(roomState, ownPlayerId, nickname), [roomState, ownPlayerId, nickname, stateVersion]);
  const ownPlayer = players.find((player) => player.seat === "self") ?? fallbackPlayers[0];
  const ownReady = rawPlayers.find((player) => player.id === ownPlayerId)?.ready ?? false;
  const currentPlayer = players.find((player) => player.id === roomState?.currentPlayerId) ?? ownPlayer;
  const phase = (roomState?.phase ?? "waiting") as HeartAttackPhase;
  const lastCard = roomState?.lastCard?.id ? toDemoCard(roomState.lastCard) : null;
  const penaltyResult = roomState?.penaltyNotice?.id ? toPenaltyResult(roomState.penaltyNotice) : null;
  const canUseRoom = status === "connected" && !!roomRef.current;
  const canStart = canUseRoom && phase === "waiting" && rawPlayers.length >= 3 && rawPlayers.every((player) => player.ready);
  const canSlap = canUseRoom && phase !== "waiting" && phase !== "round-result" && phase !== "finished";

  function send(type: "SET_READY" | "START_GAME" | "ADD_BOT" | "SLAP" | "PLAY_AGAIN" | "CLOSE_ROOM", extra: Record<string, unknown> = {}) {
    const room = roomRef.current;
    if (!room) return;
    const actionId = `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    room.send(type, { type, actionId, ...extra });
  }

  function leaveAndCloseRoom() {
    if (!roomRef.current) {
      window.location.href = "/";
      return;
    }
    send("CLOSE_ROOM");
    window.setTimeout(() => {
      window.location.href = "/";
    }, 160);
  }

  function slap() {
    if (!canSlap) return;
    setSlapCount((count) => count + 1);
    send("SLAP");
  }

  if (phase === "waiting") {
    return (
      <main className="heart-auto-shell">
        <HeartHeader roomCode={roomCode} status={status} onLeave={leaveAndCloseRoom} />
        <section className="heart-waiting-room">
          <div className="waiting-room-title">
            <span className="stamp">等待室</span>
            <h1>心臟病 房間</h1>
          </div>
          <div className="waiting-room-code">
            <span>{formatRoom(roomCode)}</span>
            <button type="button" onClick={() => navigator.clipboard?.writeText(roomCode)}>複製房號</button>
          </div>
          <div className="heart-lobby-list">
            {rawPlayers.map((player, index) => (
              <LobbySeat key={player.id} player={player} index={index} isSelf={player.id === ownPlayerId} />
            ))}
          </div>
          <div className="heart-lobby-actions">
            <button type="button" className={`ready-button ${ownReady ? "is-ready" : ""}`} onClick={() => send("SET_READY", { ready: !ownReady })} disabled={!canUseRoom}>
              <CheckCircle2 size={22} />
              {ownReady ? "取消準備" : "我準備好了"}
            </button>
            <button type="button" className="play-card-button compact-action" onClick={() => send("START_GAME")} disabled={!canStart}>
              <Play size={20} />
              開始遊戲
            </button>
          </div>
          <p className="waiting-room-hint">
            已加入的真人玩家才會出現在等待室。心臟病需至少 3 位真人玩家；全員準備後會進入牌桌。
          </p>
          <p className={`connection-note ${status}`}>{statusText}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="heart-auto-shell">
      <HeartHeader roomCode={roomCode} status={status} onLeave={leaveAndCloseRoom} />

      <section className={`heart-auto-table phase-${phase}`}>
        {players.filter((player) => player.seat !== "self").map((player) => (
          <Opponent key={player.seat} player={player} current={player.id === roomState?.currentPlayerId} />
        ))}

        <div className="heart-center">
          
          <div className={`call-number ${phase === "slap-window" ? "danger" : ""}`}>{roomState?.callNumber ?? 1}</div>
          <div className="played-stack">
            <div className="pile-shadow" />
            {lastCard ? <PlayingCard card={lastCard} /> : <div className="empty-card">牌堆</div>}
          </div>
          <div className="pile-count">中央牌堆 {roomState?.centerPileCount ?? 0} 張</div>
        </div>

        {penaltyResult ? (
          <PenaltyAlert
            result={penaltyResult}
            targetPlayerColor={players.find((player) => player.id === penaltyResult.playerId)?.color ?? "yellow"}
            isVisible={phase === "round-result"}
          />
        ) : null}

        {flyingCard ? (
          <div className={`flying-card from-${currentPlayer.seat}`} aria-hidden="true">
            <PlayingCard card={flyingCard} compact />
          </div>
        ) : null}

        <div className="self-zone">
          <PlayerBadge player={ownPlayer} current={ownPlayer.id === roomState?.currentPlayerId} />
          <div className="self-hand" aria-label="我的牌堆">
            {Array.from({ length: Math.min(8, ownPlayer.cardsRemaining) }).map((_, index) => (
              <div key={index} className="card-back mini" style={{ "--offset": `${index * 13}px` } as CSSProperties}>鬥</div>
            ))}
          </div>
          <div className="self-count">剩餘 {ownPlayer.cardsRemaining} 張</div>
        </div>
      </section>

      <div className="heart-slap-dock">
        <button type="button" className="slap-button docked-slap-button" onClick={slap} disabled={!canSlap}>
          <Hand size={34} />
          拍桌！
        </button>
      </div>

    </main>
  );
}

function HeartHeader({ roomCode, status, onLeave }: { roomCode: string; status: ConnectionStatus; onLeave: () => void }) {
  return (
    <header className="heart-auto-header">
      <div className="brand-lockup" aria-label="鬥陣來一局">
        <span className="brand-mark">鬥陣</span>
        <span className="brand-title">心臟病</span>
      </div>
      <div className="header-meta">
        <span>房號 <strong>{formatRoom(roomCode)}</strong></span>
        <span>第 <strong>1</strong> 局</span>
        <span className={`connection-pill ${status}`}>
          {status === "connected" ? <Wifi size={18} /> : <WifiOff size={18} />}
          {status === "connected" ? "已連線" : "連線中"}
        </span>
        <span className="real-only"><ShieldCheck size={18} />只限真人優先</span>
      </div>
      <div className="header-actions">
        <button type="button" className="outline-action"><BookOpen size={21} />玩法</button>
        <button type="button" className="leave-action" onClick={onLeave}><LogOut size={21} />離開牌局</button>
      </div>
    </header>
  );
}

function LobbySeat({ player, index, isSelf }: { player: PublicHeartAttackPlayer; index: number; isSelf: boolean }) {
  const color = colorOrder[index % colorOrder.length];
  return (
    <article className={`heart-lobby-seat lobby-${color} ${player.ready ? "ready" : ""}`}>
      <span>座位 {index + 1}</span>
      <strong>{player.nickname}{isSelf ? "（你）" : ""}</strong>
      <em>{player.type === "bot" ? "電腦玩家" : "真人玩家"}</em>
      <b>{player.ready ? "已準備" : "未準備"}</b>
    </article>
  );
}

function Opponent({ player, current }: { player: TablePlayer; current: boolean }) {
  return (
    <div className={`opponent-seat seat-${player.seat} ${current ? "is-current" : ""} ${player.connected ? "" : "disconnected"}`}>
      <PlayerBadge player={player} current={current} />
      <div className="opponent-hand">
        {Array.from({ length: Math.min(5, Math.max(0, player.cardsRemaining || 5)) }).map((_, index) => (
          <div key={index} className="card-back" style={{ "--tilt": `${(index - 2) * 5}deg` } as CSSProperties}>鬥</div>
        ))}
      </div>
      <div className="seat-count">剩餘 {player.cardsRemaining} 張</div>
    </div>
  );
}

function PlayerBadge({ player, current }: { player: TablePlayer; current: boolean }) {
  return (
    <div className={`player-badge badge-${player.color} ${current ? "active" : ""}`}>
      <span className="avatar-letter">{player.nickname.trim().slice(0, 1) || "玩"}</span>
      <strong>{player.nickname}</strong>
    </div>
  );
}

function PenaltyAlert({ result, targetPlayerColor, isVisible }: { result: PenaltyResult; targetPlayerColor: string; isVisible: boolean }) {
  const copy = getPenaltyCopy(result);

  return (
    <div className={`penalty-alert alert-${targetPlayerColor} ${isVisible ? "show" : ""}`} role="status" aria-live="assertive" aria-atomic="true">
      <div className="penalty-burst"><AlertTriangle size={64} /></div>
      <div className="penalty-copy">
        <span className="penalty-label">{copy.label}</span>
        <h2>{copy.title}</h2>
        <div className="cards-taken">收走 {result.cardsTaken} 張</div>
        <p>{copy.description}</p>
        <strong>自動出牌暫停</strong>
      </div>
      <div className="penalty-arrow" aria-hidden="true">→</div>
    </div>
  );
}

function PlayingCard({ card, compact = false }: { card: DemoCard; compact?: boolean }) {
  return (
    <div className={`playing-card ${suitClass[card.suit]} ${compact ? "compact" : ""}`}>
      <span>{card.rank}</span>
      <b>{suitSymbols[card.suit]}</b>
    </div>
  );
}

function mapPlayers(state: HeartAttackRoomStateSchema | null, ownPlayerId: string, nickname: string): TablePlayer[] {
  if (!state) return fallbackPlayers.map((player) => (player.seat === "self" ? { ...player, nickname } : player));

  const rawPlayers = Array.from(state.players ?? []);
  const own = rawPlayers.find((player) => player.id === ownPlayerId) ?? rawPlayers[0];
  const others = rawPlayers.filter((player) => player.id !== own?.id);
  const ordered = own ? [own, ...others] : rawPlayers;

  return seatOrder.map((seat, index) => {
    const player = ordered[index];
    if (!player) return { ...fallbackPlayers[index], seat };
    return {
      id: player.id,
      nickname: player.nickname,
      seat,
      color: colorOrder[index],
      cardsRemaining: player.cardsRemaining,
      connected: player.connected,
      ready: player.ready,
      type: player.type
    };
  });
}

function toDemoCard(card: { id: string; rank: string; suit: string }): DemoCard {
  return {
    id: card.id,
    rank: card.rank || "?",
    suit: isSuit(card.suit) ? card.suit : "clubs"
  };
}

function toPenaltyResult(notice: {
  id: string;
  reason: string;
  playerId: string;
  playerName: string;
  collectedCards: number;
  createdAt: number;
}): PenaltyResult {
  return {
    reason: notice.reason === "timeout" ? "no-slap" : (notice.reason as PenaltyReason),
    playerId: notice.playerId,
    playerName: notice.playerName,
    cardsTaken: notice.collectedCards,
    cardIds: [],
    responseTimeMs: null,
    occurredAt: notice.createdAt
  };
}

function isSuit(value: string): value is Suit {
  return value === "spades" || value === "hearts" || value === "diamonds" || value === "clubs";
}

function getPenaltyCopy(result: PenaltyResult) {
  switch (result.reason) {
    case "false-slap":
      return { label: "收牌！", title: `${result.playerName} 拍錯了`, description: "中央牌堆將移到他的牌堆底部。" };
    case "slowest-slap":
      return { label: "收牌！", title: `${result.playerName} 最慢反應`, description: "中央牌堆將移到他的牌堆底部。" };
    case "no-slap":
      return { label: "收牌！", title: `${result.playerName} 收牌`, description: "中央牌堆將移到他的牌堆底部。" };
    case "pending-finish-failed":
      return { label: "收牌！", title: `${result.playerName} 還沒脫身`, description: "出完牌後尚未活過一輪，必須把牌收回去。" };
  }
}

function formatRoom(value: string) {
  const clean = value.replace(/\D/g, "").slice(0, 6).padEnd(6, "-");
  return `${clean.slice(0, 3)} ${clean.slice(3)}`;
}
