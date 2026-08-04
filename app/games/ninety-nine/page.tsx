"use client";

import { BookOpen, Bot, CheckCircle2, Clock3, Crown, LogOut, Play, RotateCcw, ShieldCheck, SkipForward, Wifi, WifiOff, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Client, type Room } from "colyseus.js";
import type { Card, Suit } from "../../../lib/games/core/cards";
import type { LegalNinetyNineAction, NinetyNinePhase, NinetyNinePlayChoice } from "../../../lib/games/ninety-nine";
import { NinetyNineRoomStateSchema, type PublicNinetyNinePlayer } from "../../../server/schema/NinetyNineRoomState";
import type { NinetyNineServerEvent } from "../../../server/messages/ninetyNineMessages";
import { useBgmMode } from "../../SoundProvider";
import { RoomHeader, RoomOpponentSeat, RoomSelfBadge, RoomTable, UnifiedWaitingRoom, type UnifiedPlayer } from "../room";

type ConnectionStatus = "connecting" | "connected" | "error" | "closed";
type Seat = "self" | "top" | "left" | "right" | "upperLeft" | "upperRight";

const gameServerUrl = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "ws://localhost:2567";
const seatOrder: Seat[] = ["self", "top", "left", "right", "upperLeft", "upperRight"];
const suitMarks: Record<Suit, string> = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" };
const difficultyLabels = [
  { label: "簡單", value: "easy" },
  { label: "普通", value: "normal" },
  { label: "困難", value: "hard" }
] as const;

export default function NinetyNinePage() {
  const [roomCode, setRoomCode] = useState("------");
  const [nickname, setNickname] = useState("玩家");
  const [ownPlayerId, setOwnPlayerId] = useState("");
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [statusText, setStatusText] = useState("正在連接遊戲伺服器...");
  const [roomState, setRoomState] = useState<NinetyNineRoomStateSchema | null>(null);
  const [stateVersion, setStateVersion] = useState(0);
  const [hand, setHand] = useState<Card[]>([]);
  const [legalActions, setLegalActions] = useState<LegalNinetyNineAction[]>([]);
  const [selectedCardId, setSelectedCardId] = useState("");
  const [events, setEvents] = useState<NinetyNineServerEvent[]>([]);
  const [flyingCard, setFlyingCard] = useState<Card | null>(null);
  const [dealAnimation, setDealAnimation] = useState({ active: false, visible: 0 });
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const roomRef = useRef<Room<NinetyNineRoomStateSchema> | null>(null);
  const lastCardIdRef = useRef("");
  const hasStartedDealRef = useRef(false);

  useEffect(() => {
    let disposed = false;
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode") === "join" ? "join" : "create";
    const requestedRoom = (params.get("room") ?? "").replace(/\D/g, "").slice(0, 6);
    const name = params.get("name")?.trim() || params.get("nickname")?.trim() || "玩家";
    const maxPlayers = Number(params.get("players") ?? 4);
    const bots = Number(params.get("bots") ?? 0);
    const difficulty = params.get("difficulty") ?? "普通";
    const clientId = getTabClientId("ninety-nine");
    const client = new Client(gameServerUrl);

    setNickname(name);

    async function connect() {
      try {
        setStatus("connecting");
        setStatusText(mode === "join" ? `正在加入房間 ${requestedRoom}...` : "正在建立九九私人房間...");

        const room =
          mode === "join"
            ? await client.join<NinetyNineRoomStateSchema>("ninety_nine", { nickname: name, roomCode: requestedRoom, clientId }, NinetyNineRoomStateSchema)
            : await client.create<NinetyNineRoomStateSchema>("ninety_nine", { nickname: name, maxPlayers, bots, difficulty, clientId }, NinetyNineRoomStateSchema);

        if (disposed) {
          await room.leave();
          return;
        }

        roomRef.current = room;
        setOwnPlayerId(`player-${room.sessionId}`);
        setStatus("connected");
        setStatusText(mode === "join" ? "已加入九九等待室，請切換準備狀態。" : "九九房間已建立，分享房號邀請朋友。");
        setRoomState(room.state);
        setRoomCode(room.state.roomCode || room.roomId.slice(0, 6));
        setStateVersion((version) => version + 1);

        room.onStateChange((state) => {
          setRoomState(state);
          setRoomCode(state.roomCode || room.roomId.slice(0, 6));
          setStateVersion((version) => version + 1);
          const nextCardId = state.lastCard?.id ?? "";
          if (nextCardId && nextCardId !== lastCardIdRef.current) {
            setFlyingCard({ id: state.lastCard.id, rank: state.lastCard.rank as Card["rank"], suit: state.lastCard.suit as Suit });
            window.setTimeout(() => setFlyingCard(null), 560);
          }
          lastCardIdRef.current = nextCardId;
        });

        room.onMessage<NinetyNineServerEvent>("ninety-nine:event", (event) => {
          setEvents((current) => [event, ...current].slice(0, 8));
          if (event.type === "ACTION_REJECTED") setStatusText(event.reason);
          if (event.type === "HAND_UPDATED") {
            setHand(event.cards);
            if (!hasStartedDealRef.current && event.cards.length > 0) {
              hasStartedDealRef.current = true;
              setDealAnimation({ active: true, visible: 0 });
            }
            setLegalActions(event.legalActions);
            setSelectedCardId((current) => current && event.cards.some((card) => card.id === current) ? current : event.cards[0]?.id ?? "");
          }
          if (event.type === "ROOM_CLOSED") window.location.href = "/";
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
        setStatusText(error instanceof Error ? error.message : "無法建立或加入九九房間");
      }
    }

    connect();

    return () => {
      disposed = true;
      roomRef.current?.leave();
      roomRef.current = null;
    };
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

  const rawPlayers = useMemo(() => Array.from(roomState?.players ?? []), [roomState, stateVersion]);
  const emptySeatCount = Math.max(0, (roomState?.maxPlayers ?? 4) - rawPlayers.length);
  const ownReady = rawPlayers.find((player) => player.id === ownPlayerId)?.ready ?? false;
  const ownPlayer = rawPlayers.find((player) => player.id === ownPlayerId);
  const isHost = ownPlayer?.host ?? false;
  const phase = (roomState?.phase ?? "waiting") as NinetyNinePhase;
  useBgmMode(phase === "waiting" ? "lobby" : "playing");
  const canUseRoom = status === "connected" && !!roomRef.current;
  const canStart = canUseRoom && isHost && phase === "waiting" && rawPlayers.length >= 2 && rawPlayers.every((player) => player.ready);
  const selectedCard = hand.find((card) => card.id === selectedCardId) ?? hand[0];
  const selectedLegalActions = selectedCard ? legalActions.filter((action) => action.cardId === selectedCard.id) : [];
  const isMyTurn = roomState?.currentPlayerId === ownPlayerId;
  const lastCard = roomState?.lastCard?.id ? { id: roomState.lastCard.id, rank: roomState.lastCard.rank as Card["rank"], suit: roomState.lastCard.suit as Suit } : null;
  const sortedPlayers = mapPlayers(rawPlayers, ownPlayerId);
  const countdown = useCountdown(roomState?.turnDeadline ?? 0, stateVersion);

  function send(type: "SET_READY" | "START_GAME" | "ADD_BOT" | "REMOVE_BOT" | "PLAY_CARD" | "PLAY_AGAIN" | "CLOSE_ROOM", extra: Record<string, unknown> = {}) {
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

  function play(choice: NinetyNinePlayChoice) {
    if (!selectedCard || !isMyTurn || phase !== "playing") return;
    send("PLAY_CARD", { cardId: selectedCard.id, choice });
  }

  function reorderByDrop(targetCardId: string) {
    if (!draggedCardId || draggedCardId === targetCardId) return;
    setHand((current) => {
      const from = current.findIndex((card) => card.id === draggedCardId);
      const to = current.findIndex((card) => card.id === targetCardId);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDraggedCardId(null);
  }

  if (phase === "waiting") {
    return <UnifiedWaitingRoom
      gameName="九九"
      roomCode={roomCode}
      status={status}
      statusText={statusText}
      players={rawPlayers.map((player) => ({ id: player.id, seat: player.seat, nickname: player.nickname, host: player.host, ready: player.ready, type: player.type }))}
      maxPlayers={roomState?.maxPlayers ?? 6}
      ownId={ownPlayerId}
      isHost={isHost}
      canUseRoom={canUseRoom}
      canStart={canStart}
      allowBots
      minPlayers={2}
      onReady={() => send("SET_READY", { ready: !ownReady })}
      onAddBot={() => send("ADD_BOT", { difficulty: "normal" })}
      onStart={() => send("START_GAME")}
      onLeave={leaveAndCloseRoom}
    />;
  }
  if (false) {
    return (
      <main className="heart-auto-shell ninety-online-shell">
        <NinetyHeader roomCode={roomCode} status={status} onLeave={leaveAndCloseRoom} />
        <section className="heart-waiting-room ninety-waiting-room">
          <div className="waiting-room-title">
            <span className="stamp">等待室</span>
            <h1>九九 房間</h1>
          </div>
          <div className="waiting-room-code">
            <span>{formatRoom(roomCode)}</span>
            <button type="button" onClick={() => navigator.clipboard?.writeText(roomCode)}>複製房號</button>
          </div>
          <div className="heart-lobby-list ninety-lobby-list">
            {rawPlayers.map((player) => (
              <LobbySeat key={player.id} player={player} isSelf={player.id === ownPlayerId} />
            ))}
            {Array.from({ length: emptySeatCount }).map((_, index) => (
              <LobbyEmptySeat key={`empty-${index}`} seatNumber={rawPlayers.length + index + 1} />
            ))}
          </div>
          <div className="heart-lobby-actions">
            <button type="button" className={`ready-button ${ownReady ? "is-ready" : ""}`} onClick={() => send("SET_READY", { ready: !ownReady })} disabled={!canUseRoom}>
              <CheckCircle2 size={22} />
              {ownReady ? "取消準備" : "我準備好了"}
            </button>
            {isHost ? (
              <>
                <button type="button" className="ready-button bot-button" onClick={() => send("ADD_BOT", { difficulty: "normal" })} disabled={!canUseRoom || rawPlayers.length >= (roomState?.maxPlayers ?? 6)}>
                  <Bot size={22} />
                  加電腦補位
                </button>
                <button type="button" className="play-card-button compact-action" onClick={() => send("START_GAME")} disabled={!canStart}>
                  <Play size={20} />
                  開始遊戲
                </button>
              </>
            ) : null}
          </div>
          <p className="waiting-room-hint">九九支援 2 至 6 位玩家，電腦補位會自動顯示已準備；全員準備後由房主開始。</p>
          <p className={`connection-note ${status}`}>{statusText}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="heart-auto-shell ninety-online-shell">
      <NinetyHeader roomCode={roomCode} status={status} onLeave={leaveAndCloseRoom} />
      <RoomTable gameName="九九" className={`ninety-online-table phase-${phase}`}>
        {sortedPlayers.filter((player) => player.seat !== "self").map((player) => (
          <OpponentSeat key={player.id} player={player} current={player.id === roomState?.currentPlayerId} />
        ))}

        <div className="ninety-center">
          <div className="total-hub">
            <span>目前累積</span>
            <strong>{roomState?.currentTotal ?? 0}</strong>
            <em>上限 99</em>
          </div>
          <div className="last-card-stack">
            {lastCard ? <PlayingCard card={lastCard} compact /> : <div className="empty-card">牌堆</div>}
            <i />
            <i />
          </div>
          <div className="turn-callout online">
            <strong>{isMyTurn ? "輪到你了！" : `輪到 ${currentPlayerName(rawPlayers, roomState?.currentPlayerId ?? "")}`}</strong>
            <span className="turn-clock"><Clock3 size={18} />{countdown}</span>
            <em>{roomState?.direction === -1 ? "逆時針" : "順時針"}</em>
          </div>
          
          <div className="last-effect">{roomState?.lastSystemAction ? "系統代為出牌：" : ""}{roomState?.lastEffect || "等待第一張牌"}</div>
        </div>

        {flyingCard ? (
          <div className="motion-card play" aria-hidden="true">
            <PlayingCard card={flyingCard} compact />
          </div>
        ) : null}

        {dealAnimation.active && dealAnimation.visible < hand.length ? (
          <div className="deal-animation-card ninety-deal-animation-card" aria-hidden="true"><div className="deal-card-back" /></div>
        ) : null}

        <div className="self-zone ninety-self-zone">
          <RoomSelfBadge nickname={nickname} active={isMyTurn} count={hand.length} />
          <div className="ninety-nine-hand fan-hand online-hand" aria-label="自己的五張手牌">
            {(dealAnimation.active ? hand.slice(0, dealAnimation.visible) : hand).map((card, index) => {
              const playable = isMyTurn && selectedLegalFor(card, legalActions).length > 0 && phase === "playing";
              return (
                <button
                  className={`ninety-nine-card face-card fan-${index} ${selectedCardId === card.id ? "selected" : ""} ${playable ? "" : "disabled"}`}
                  draggable
                  key={card.id}
                  onClick={() => setSelectedCardId(card.id)}
                  onDragStart={() => setDraggedCardId(card.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => reorderByDrop(card.id)}
                  type="button"
                  aria-pressed={selectedCardId === card.id}
                >
                  <PlayingCard card={card} />
                </button>
              );
            })}
          </div>
        </div>
      </RoomTable>

      <div className="bottom-command-bar ninety-command-bar">
        <SpecialOptions
          card={selectedCard}
          legalActions={selectedLegalActions}
          players={rawPlayers}
          disabled={!isMyTurn || phase !== "playing"}
          onPlay={play}
        />
      </div>

      {phase === "finished" ? (
        <div className="ninety-result-banner">
          <Crown size={34} />
          <strong>{currentPlayerName(rawPlayers, roomState?.winnerId ?? "")} 獲勝！</strong>
          {isHost ? <button type="button" onClick={() => send("PLAY_AGAIN")}>再來一局</button> : null}
        </div>
      ) : null}

      <div className="sr-only" aria-live="polite">{events[0]?.type ?? statusText}</div>
    </main>
  );
}

function NinetyHeader({ roomCode, status, onLeave }: { roomCode: string; status: ConnectionStatus; onLeave: () => void }) {
  return <RoomHeader gameName="九九" roomCode={roomCode} status={status} docsHref="/docs/games/ninety-nine.md" onLeave={onLeave} />;
}

function LobbySeat({ player, isSelf }: { player: PublicNinetyNinePlayer; isSelf: boolean }) {
  return (
    <article className={`heart-lobby-seat lobby-${player.seat % 2 === 0 ? "yellow" : "green"} ${player.ready ? "ready" : ""}`}>
      <span className="lobby-card-corner">{player.nickname.slice(0, 1) || "玩"}</span>
      <span>座位 {player.seat + 1}{player.host ? " · 房主" : ""}</span>
      <strong>{player.nickname}{isSelf ? "（你）" : ""}</strong>
      <em>{player.type === "bot" ? `電腦玩家 ${difficultyName(player.botDifficulty)}` : "真人玩家"}</em>
      <b>{player.ready ? "已準備" : "未準備"}</b>
    </article>
  );
}

function LobbyEmptySeat({ seatNumber }: { seatNumber: number }) {
  return (
    <article className="heart-lobby-seat lobby-empty-seat" aria-label={`座位 ${seatNumber} 等待玩家`}>
      <span className="empty-seat-icon" aria-hidden="true">♙</span>
      <strong>等待玩家</strong>
      <em>空位</em>
    </article>
  );
}

function OpponentSeat({ player, current }: { player: { id: string; nickname: string; seat: Seat; cardsRemaining: number; status: string; type: string; connected: boolean }; current: boolean }) {
  if (player.seat === "self") return null;
  const position = player.seat === "upperLeft" ? "upper-left" : player.seat === "upperRight" ? "upper-right" : player.seat;
  return <RoomOpponentSeat player={{ id: player.id, nickname: player.nickname, cardsRemaining: player.cardsRemaining, status: player.status, type: player.type, connected: player.connected }} position={position} active={current} />;
}

function SpecialOptions({
  card,
  legalActions,
  players,
  disabled,
  onPlay
}: {
  card?: Card;
  legalActions: LegalNinetyNineAction[];
  players: PublicNinetyNinePlayer[];
  disabled: boolean;
  onPlay: (choice: NinetyNinePlayChoice) => void;
}) {
  if (!card) return <div className="special-card-panel pill-panel"><strong>等待手牌</strong></div>;
  if (legalActions.length === 0) return <div className="special-card-panel pill-panel disabled"><X size={20} /><strong>此牌目前不能出</strong></div>;

  if (card.rank === "10" || card.rank === "Q") {
    return (
      <div className="special-card-panel choice-panel">
        {legalActions.map((action) => action.choice.kind === "plus-minus" ? (
          <button key={`${card.id}-${action.choice.value}`} onClick={() => onPlay(action.choice)} disabled={disabled} type="button">
            {action.choice.value > 0 ? `+${action.choice.value}` : action.choice.value}
          </button>
        ) : null)}
      </div>
    );
  }

  if (card.rank === "5") {
    return (
      <div className="special-card-panel pill-panel target-panel">
        <strong>指定下一位玩家</strong>
        {legalActions.map((action) => action.choice.kind === "target-player" ? (
          <button key={action.choice.targetPlayerId} onClick={() => onPlay(action.choice)} disabled={disabled} type="button">
            {currentPlayerName(players, action.choice.targetPlayerId)}
          </button>
        ) : null)}
      </div>
    );
  }

  const choice = legalActions[0].choice;
  return (
    <div className="special-card-panel pill-panel">
      {card.rank === "4" ? <RotateCcw size={22} /> : card.rank === "J" ? <SkipForward size={22} /> : null}
      <strong>{card.rank === "4" ? "迴轉提示" : card.rank === "J" ? "Pass" : card.rank === "K" ? "設為 99" : `${card.rank} 加點`}</strong>
      <button onClick={() => onPlay(choice)} disabled={disabled} type="button">
        <Play size={20} />
        出牌
      </button>
    </div>
  );
}

function PlayingCard({ card, compact = false }: { card: Card; compact?: boolean }) {
  const red = card.suit === "diamonds" || card.suit === "hearts";
  return (
    <div className={`card-face ${compact ? "compact" : ""} ${red ? "red" : "black"}`}>
      <span>{card.rank}</span>
      <em>{suitMarks[card.suit]}</em>
      {!compact && <strong>{card.rank}</strong>}
    </div>
  );
}

function mapPlayers(players: PublicNinetyNinePlayer[], ownPlayerId: string) {
  const own = players.find((player) => player.id === ownPlayerId) ?? players[0];
  const others = players.filter((player) => player.id !== own?.id);
  const ordered = own ? [own, ...others] : players;
  return ordered.map((player, index) => ({
    id: player.id,
    nickname: player.nickname,
    seat: seatOrder[index] ?? "top",
    cardsRemaining: player.cardsRemaining,
    status: player.status,
    type: player.type,
    connected: player.connected
  }));
}

function selectedLegalFor(card: Card, legalActions: LegalNinetyNineAction[]) {
  return legalActions.filter((action) => action.cardId === card.id);
}

function currentPlayerName(players: PublicNinetyNinePlayer[], playerId: string) {
  return players.find((player) => player.id === playerId)?.nickname || "玩家";
}

function useCountdown(deadline: number, version: number) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    function update() {
      setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    }
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [deadline, version]);
  return seconds;
}

function difficultyName(value: string) {
  return difficultyLabels.find((item) => item.value === value)?.label ?? "普通";
}

function formatRoom(value: string) {
  const clean = value.replace(/\D/g, "").slice(0, 6).padEnd(6, "-");
  return `${clean.slice(0, 3)} ${clean.slice(3)}`;
}

function getTabClientId(scope: string) {
  const key = `poker-${scope}-client-id`;
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const next = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.sessionStorage.setItem(key, next);
  return next;
}
