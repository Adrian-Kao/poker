"use client";

import { BookOpen, Bot, CheckCircle2, ChevronLeft, ChevronRight, LogOut, Play, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Client, type Room } from "colyseus.js";
import type { BluffCard, BluffPhase, BluffRank } from "../../../lib/games/bluff";
import { bluffRanks } from "../../../lib/games/bluff";
import { BluffRoomStateSchema, type PublicBluffPlayer } from "../../../server/schema/BluffRoomState";
import type { BluffServerEvent } from "../../../server/messages/bluffMessages";
import { useBgmMode, useSoundControls } from "../../SoundProvider";

type ConnectionStatus = "connecting" | "connected" | "error" | "closed";
type SeatPosition = "top" | "left" | "right";
type BluffClientMessageType = "SET_READY" | "START_GAME" | "ADD_BOT" | "REMOVE_BOT" | "PLAY_CARDS" | "REACT_TO_CLAIM" | "PLAY_AGAIN" | "CLOSE_ROOM";

const gameServerUrl = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "ws://localhost:2567";
const opponentPositions: SeatPosition[] = ["top", "left", "right"];
const difficultyLabels = [
  { label: "簡單", value: "easy" },
  { label: "普通", value: "normal" },
  { label: "困難", value: "hard" }
] as const;

export default function LiarPage() {
  const { playSound } = useSoundControls();
  const [roomCode, setRoomCode] = useState("------");
  const [nickname, setNickname] = useState("玩家");
  const [ownPlayerId, setOwnPlayerId] = useState("");
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [statusText, setStatusText] = useState("正在連接吹牛房間...");
  const [roomState, setRoomState] = useState<BluffRoomStateSchema | null>(null);
  const [stateVersion, setStateVersion] = useState(0);
  const [hand, setHand] = useState<BluffCard[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [claimedRankIndex, setClaimedRankIndex] = useState(11);
  const [events, setEvents] = useState<BluffServerEvent[]>([]);
  const [reaction, setReaction] = useState<"trust" | "challenge" | null>(null);
  const roomRef = useRef<Room<BluffRoomStateSchema> | null>(null);
  const lastResultSoundKeyRef = useRef("");

  useEffect(() => {
    let disposed = false;
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode") === "join" ? "join" : "create";
    const requestedRoom = (params.get("room") ?? "").replace(/\D/g, "").slice(0, 6);
    const name = params.get("name")?.trim() || params.get("nickname")?.trim() || params.get("nick")?.trim() || "玩家";
    const maxPlayers = Number(params.get("players") ?? 4);
    const bots = Number(params.get("bots") ?? 0);
    const difficulty = params.get("difficulty") ?? "normal";
    const client = new Client(gameServerUrl);

    setNickname(name);

    async function connect() {
      try {
        setStatus("connecting");
        setStatusText(mode === "join" ? `正在加入房間 ${requestedRoom}...` : "正在建立吹牛私人房間...");

        const room =
          mode === "join"
            ? await client.join<BluffRoomStateSchema>("bluff", { nickname: name, roomCode: requestedRoom }, BluffRoomStateSchema)
            : await client.create<BluffRoomStateSchema>("bluff", { nickname: name, maxPlayers, bots, difficulty }, BluffRoomStateSchema);

        if (disposed) {
          await room.leave();
          return;
        }

        roomRef.current = room;
        setOwnPlayerId(`player-${room.sessionId}`);
        setStatus("connected");
        setStatusText(mode === "join" ? "已加入吹牛等待室，請切換準備狀態。" : "吹牛房間已建立，分享房號邀請朋友。");
        setRoomState(room.state);
        setRoomCode(room.state.roomCode || room.roomId.slice(0, 6));
        setStateVersion((version) => version + 1);

        room.onStateChange((state) => {
          setRoomState(state);
          setRoomCode(state.roomCode || room.roomId.slice(0, 6));
          setStateVersion((version) => version + 1);
          if (state.phase !== "reaction-window") setReaction(null);
        });

        room.onMessage<BluffServerEvent>("bluff:event", (event) => {
          setEvents((current) => [event, ...current].slice(0, 8));
          if (event.type === "ACTION_REJECTED") setStatusText(event.reason);
          if (event.type === "HAND_UPDATED") {
            setHand(event.cards);
            setSelectedIds((current) => current.filter((id) => event.cards.some((card) => card.id === id)));
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
        setStatusText(error instanceof Error ? error.message : "無法建立或加入吹牛房間");
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
    const rank = roomState?.roundClaimRank as BluffRank | "";
    const index = bluffRanks.indexOf(rank as BluffRank);
    if (index >= 0) setClaimedRankIndex(index);
  }, [roomState?.roundClaimRank]);

  useEffect(() => {
    const notice = roomState?.notice ?? "";
    if (roomState?.phase !== "round-result" || !notice) return;
    const soundKey = `${roomState.turnNumber}-${notice}`;
    if (lastResultSoundKeyRef.current === soundKey) return;
    lastResultSoundKeyRef.current = soundKey;
    if (notice === "抓到了齁") playSound("correct");
    if (notice === "說好的信任呢") playSound("wrong");
  }, [playSound, roomState?.notice, roomState?.phase, roomState?.turnNumber]);

  const rawPlayers = useMemo(() => Array.from(roomState?.players ?? []), [roomState, stateVersion]);
  const phase = (roomState?.phase ?? "waiting") as BluffPhase;
  useBgmMode(phase === "waiting" ? "lobby" : "playing");
  const ownPlayer = rawPlayers.find((player) => player.id === ownPlayerId);
  const ownReady = ownPlayer?.ready ?? false;
  const isHost = ownPlayer?.host ?? false;
  const canUseRoom = status === "connected" && !!roomRef.current;
  const canStart = canUseRoom && isHost && phase === "waiting" && rawPlayers.length >= 3 && rawPlayers.every((player) => player.ready);
  const selectedCards = useMemo(() => hand.filter((card) => selectedIds.includes(card.id)), [hand, selectedIds]);
  const claimedRank = bluffRanks[claimedRankIndex] as BluffRank;
  const isMyTurn = roomState?.currentPlayerId === ownPlayerId && phase === "playing";
  const isOpeningPlay = isMyTurn && (roomState?.centerPileCount ?? 0) === 0 && !roomState?.roundClaimRank;
  const fixedRoundRank = (roomState?.roundClaimRank || claimedRank) as BluffRank;
  const canReact = phase === "reaction-window" && roomState?.lastBatchPlayerId !== ownPlayerId && !!roomState?.lastBatchId;
  const reactionCountdown = useCountdown(roomState?.reactionDeadline ?? 0, stateVersion);
  const opponents = mapOpponents(rawPlayers, ownPlayerId);
  const lastPlayerName = currentPlayerName(rawPlayers, roomState?.lastBatchPlayerId ?? "");
  const notice = reaction === "trust" && phase === "reaction-window"
    ? ""
    : roomState?.notice || (roomState?.roundClaimRank ? `${lastPlayerName} 出了 ${roomState.roundClaimCount} 張 ${roomState.roundClaimRank}` : "等待第一手喊牌");
  const revealedCards = useMemo(
    () => Array.from(roomState?.revealedCards ?? []).map((card) => ({
      id: card.id,
      rank: card.rank as BluffCard["rank"],
      suit: card.suit === "joker" ? null : card.suit as BluffCard["suit"]
    })),
    [roomState, stateVersion]
  );

  function send(type: BluffClientMessageType, extra: Record<string, unknown> = {}) {
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

  function toggleCard(cardId: string) {
    if (!isMyTurn) return;
    setSelectedIds((current) => {
      if (current.includes(cardId)) return current.filter((id) => id !== cardId);
      if (current.length >= 4) return current;
      return [...current, cardId];
    });
  }

  function changeRank(offset: -1 | 1) {
    setClaimedRankIndex((current) => (current + offset + bluffRanks.length) % bluffRanks.length);
  }

  function playCoveredCards() {
    if (!isMyTurn || selectedIds.length === 0) return;
    send("PLAY_CARDS", { cardIds: selectedIds, roundClaimRank: fixedRoundRank });
    setSelectedIds([]);
  }

  function react(choice: "trust" | "challenge") {
    if (!canReact) return;
    setReaction(choice);
    send("REACT_TO_CLAIM", { choice });
  }

  if (phase === "waiting") {
    return (
      <main className="heart-auto-shell ninety-online-shell">
        <BluffHeader roomCode={roomCode} status={status} onLeave={leaveAndCloseRoom} />
        <section className="heart-waiting-room ninety-waiting-room">
          <div className="waiting-room-title">
            <span className="stamp">等待室</span>
            <h1>吹牛 房間</h1>
          </div>
          <div className="waiting-room-code">
            <span>{formatRoom(roomCode)}</span>
            <button type="button" onClick={() => navigator.clipboard?.writeText(roomCode)}>複製房號</button>
          </div>
          <div className="heart-lobby-list ninety-lobby-list">
            {rawPlayers.map((player) => (
              <LobbySeat key={player.id} player={player} isSelf={player.id === ownPlayerId} />
            ))}
          </div>
          <div className="heart-lobby-actions">
            <button type="button" className={`ready-button ${ownReady ? "is-ready" : ""}`} onClick={() => send("SET_READY", { ready: !ownReady })} disabled={!canUseRoom}>
              <CheckCircle2 size={22} />
              {ownReady ? "已準備" : "我準備好了"}
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
          <p className="waiting-room-hint">吹牛支援 3 至 6 位玩家，電腦補位會自動顯示已準備；全員準備後由房主開始。</p>
          <p className={`connection-note ${status}`}>{statusText}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="bluff-page-shell">
      <BluffTopbar roomCode={roomCode} status={status} onLeave={leaveAndCloseRoom} />

      <section className="bluff-table bluff-table-like-ninety" aria-label="吹牛牌桌">
        {opponents.map((player) => (
          <OpponentSeat key={player.id} player={player} />
        ))}

        <p className="bluff-pile-count">
          累積牌數 {roomState?.centerPileCount ?? 0} 張
        </p>
        {phase === "reaction-window" ? <p className="bluff-reaction-timer">倒數 {reactionCountdown} 秒</p> : null}

        <div className="bluff-center-zone">
          <div className="bluff-center-stack" aria-label="中央覆蓋牌堆">
            {Array.from({ length: Math.min(6, Math.max(1, roomState?.centerPileCount ?? 1)) }).map((_, index) => (
              <i key={index} />
            ))}
          </div>

          {notice ? (
            <article className="bluff-claim-card" aria-live="polite">
              <strong>{notice}</strong>
            </article>
          ) : null}

          {revealedCards.length > 0 ? (
            <div className="bluff-revealed-cards" aria-label="上一手揭牌">
              {revealedCards.map((card) => (
                <PlayingCard key={card.id} card={card} />
              ))}
            </div>
          ) : null}
        </div>

        {canReact && reaction !== "trust" ? (
          <div className="bluff-reaction-row">
            <button onClick={() => react("trust")} type="button">
              信你啦
            </button>
            <button className={reaction === "challenge" ? "active" : ""} onClick={() => react("challenge")} type="button">
              賣唬爛
            </button>
          </div>
        ) : null}

        <section className="bluff-self-zone" aria-label="自己的手牌">
          <div className="bluff-self-badge">
            <div className="bluff-avatar yellow">{(nickname || "你").slice(0, 1)}</div>
            <div>
              <span>你的手牌</span>
              <strong>{nickname}</strong>
            </div>
          </div>

          <div className="bluff-hand">
            {hand.map((card) => (
              <button
                aria-pressed={selectedIds.includes(card.id)}
                className={`bluff-card-button ${selectedIds.includes(card.id) ? "selected" : ""}`}
                disabled={!isMyTurn}
                key={card.id}
                onClick={() => toggleCard(card.id)}
                type="button"
              >
                <PlayingCard card={card} />
              </button>
            ))}
          </div>
        </section>
      </section>

      <section className="bluff-bottom-controls bluff-table-controls" aria-label="喊牌與出牌">
        {isOpeningPlay ? <Stepper label="喊的數字" value={claimedRank} onDecrease={() => changeRank(-1)} onIncrease={() => changeRank(1)} /> : null}
        <button className="bluff-play-button" disabled={!isMyTurn || selectedCards.length === 0} onClick={playCoveredCards} type="button">
          <Play size={28} />
          覆蓋出牌
        </button>
      </section>

      {phase === "finished" ? (
        <div className="ninety-result-banner">
          <strong>{currentPlayerName(rawPlayers, roomState?.winnerId ?? "")} 獲勝！</strong>
          {isHost ? <button type="button" onClick={() => send("PLAY_AGAIN")}>再來一局</button> : null}
        </div>
      ) : null}

      <div className="sr-only" aria-live="polite">{events[0]?.type ?? statusText}</div>
    </main>
  );
}

function BluffHeader({ roomCode, status, onLeave }: { roomCode: string; status: ConnectionStatus; onLeave: () => void }) {
  return (
    <header className="heart-auto-header">
      <div className="brand-lockup" aria-label="鬥陣來一局">
        <span className="brand-mark">鬥陣</span>
        <span className="brand-title">吹牛</span>
      </div>
      <div className="header-meta">
        <span>房號 <strong>{formatRoom(roomCode)}</strong></span>
        <span>第 <strong>1</strong> 局</span>
        <span className={`connection-pill ${status}`}>
          {status === "connected" ? <Wifi size={18} /> : <WifiOff size={18} />}
          {status === "connected" ? "已連線" : "連線中"}
        </span>
        <span className="real-only"><ShieldCheck size={18} />純娛樂</span>
      </div>
      <div className="header-actions">
        <a className="outline-action" href="/docs/games/bluff.md"><BookOpen size={21} />玩法</a>
        <button type="button" className="leave-action" onClick={onLeave}><LogOut size={21} />離開牌局</button>
      </div>
    </header>
  );
}

function BluffTopbar({ roomCode, status, onLeave }: { roomCode: string; status: ConnectionStatus; onLeave: () => void }) {
  return (
    <header className="bluff-topbar">
      <a className="bluff-logo" href="/" aria-label="鬥陣">
        鬥陣
      </a>
      <h1>吹牛</h1>
      <div className="bluff-meta">
        <span>
          房號 <b>{formatRoom(roomCode)}</b>
        </span>
        <span>
          第 <b>1</b> 局
        </span>
        <strong>
          <ShieldCheck size={18} />
          {status === "connected" ? "已連線" : "連線中"}
        </strong>
      </div>
      <nav className="bluff-actions" aria-label="牌局操作">
        <button type="button">
          <BookOpen size={22} />
          玩法
        </button>
        <button type="button" onClick={onLeave}>
          <LogOut size={22} />
          離開牌局
        </button>
      </nav>
    </header>
  );
}

function LobbySeat({ player, isSelf }: { player: PublicBluffPlayer; isSelf: boolean }) {
  return (
    <article className={`heart-lobby-seat lobby-${player.seat % 2 === 0 ? "yellow" : "green"} ${player.ready ? "ready" : ""}`}>
      <span className="lobby-card-corner">{player.nickname.slice(0, 1) || "牌"}</span>
      <span>座位 {player.seat + 1}{player.host ? " · 房主" : ""}</span>
      <strong>{player.nickname}{isSelf ? "（你）" : ""}</strong>
      <em>{player.type === "bot" ? `電腦玩家 ${difficultyName(player.botDifficulty)}` : "真人玩家"}</em>
      <b>{player.ready ? "已準備" : "未準備"}</b>
    </article>
  );
}

function OpponentSeat({ player }: { player: { id: string; name: string; cards: number; type: "bot" | "human"; position: SeatPosition } }) {
  return (
    <article className={`bluff-opponent-seat ${player.position}`}>
      <div className="bluff-player-badge">
        <div className="bluff-avatar">{player.name.slice(0, 1)}</div>
        <div>
          <strong>{player.name}</strong>
          <span>{player.cards} 張牌</span>
        </div>
        {player.type === "bot" && <em>電腦</em>}
      </div>
      <div className="bluff-card-back-stack" aria-hidden="true">
        {Array.from({ length: Math.min(5, Math.max(1, player.cards)) }).map((_, index) => (
          <i key={index} />
        ))}
      </div>
    </article>
  );
}

function Stepper({ label, value, onDecrease, onIncrease }: { label: string; value: string; onDecrease: () => void; onIncrease: () => void }) {
  return (
    <div className="bluff-stepper">
      <span>{label}</span>
      <div>
        <button onClick={onDecrease} type="button" aria-label={`${label}往前`}>
          <ChevronLeft size={34} />
        </button>
        <strong>{value}</strong>
        <button onClick={onIncrease} type="button" aria-label={`${label}往後`}>
          <ChevronRight size={34} />
        </button>
      </div>
    </div>
  );
}

function PlayingCard({ card }: { card: BluffCard }) {
  const red = card.suit === "hearts" || card.suit === "diamonds" || card.id === "joker-red";

  return (
    <div className={`bluff-playing-card ${red ? "red" : "black"}`}>
      <span>{card.rank}</span>
      <em>{suitSymbol(card.suit)}</em>
      <b>{card.rank}</b>
    </div>
  );
}

function mapOpponents(players: PublicBluffPlayer[], ownPlayerId: string) {
  return players
    .filter((player) => player.id !== ownPlayerId && player.status !== "winner")
    .slice(0, 3)
    .map((player, index) => ({
      id: player.id,
      name: player.nickname,
      cards: player.cardsRemaining,
      type: player.type as "bot" | "human",
      position: opponentPositions[index] ?? "top"
    }));
}

function currentPlayerName(players: PublicBluffPlayer[], playerId: string) {
  return players.find((player) => player.id === playerId)?.nickname || "玩家";
}

function difficultyName(value: string) {
  return difficultyLabels.find((item) => item.value === value)?.label ?? "普通";
}

function formatRoom(value: string) {
  const clean = value.replace(/\D/g, "").slice(0, 6).padEnd(6, "-");
  return `${clean.slice(0, 3)} ${clean.slice(3)}`;
}

function suitSymbol(suit: BluffCard["suit"]) {
  if (suit === "hearts") return "♥";
  if (suit === "diamonds") return "♦";
  if (suit === "clubs") return "♣";
  if (suit === "spades") return "♠";
  return "★";
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
