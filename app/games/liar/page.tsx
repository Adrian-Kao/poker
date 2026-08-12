"use client";

import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Client, type Room } from "colyseus.js";
import type { BluffCard, BluffPhase, BluffRank } from "../../../lib/games/bluff";
import { bluffRanks } from "../../../lib/games/bluff";
import { BluffRoomStateSchema, type PublicBluffPlayer } from "../../../server/schema/BluffRoomState";
import type { BluffServerEvent } from "../../../server/messages/bluffMessages";
import { useBgmMode, useSoundControls } from "../../SoundProvider";
import { RoomHeader, RoomOpponentSeat, RoomSelfBadge, RoomTable, UnifiedWaitingRoom } from "../room";

type ConnectionStatus = "connecting" | "connected" | "error" | "closed";
type SeatPosition = "top" | "left" | "right";
type BluffClientMessageType = "SET_READY" | "START_GAME" | "ADD_BOT" | "REMOVE_BOT" | "PLAY_CARDS" | "REACT_TO_CLAIM" | "PLAY_AGAIN" | "CLOSE_ROOM";

const gameServerUrl = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "ws://localhost:2567";
const opponentPositions: SeatPosition[] = ["top", "left", "right"];
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
  const [dealAnimation, setDealAnimation] = useState({ active: false, visible: 0 });
  const [fourKindNotice, setFourKindNotice] = useState("");
  const [clearingCards, setClearingCards] = useState<BluffCard[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [claimedRankIndex, setClaimedRankIndex] = useState(11);
  const [events, setEvents] = useState<BluffServerEvent[]>([]);
  const [reaction, setReaction] = useState<"trust" | "challenge" | null>(null);
  const roomRef = useRef<Room<BluffRoomStateSchema> | null>(null);
  const lastResultSoundKeyRef = useRef("");
  const hasStartedDealRef = useRef(false);

  useEffect(() => {
    let disposed = false;
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode") === "join" ? "join" : "create";
    const requestedRoom = (params.get("room") ?? "").replace(/\D/g, "").slice(0, 6);
    const name = params.get("name")?.trim() || params.get("nickname")?.trim() || params.get("nick")?.trim() || "玩家";
    const maxPlayers = Number(params.get("players") ?? 4);
    const bots = 0;
    const difficulty = params.get("difficulty") ?? "normal";
    const clientId = getTabClientId("liar");
    const client = new Client(gameServerUrl);

    setNickname(name);

    async function connect() {
      try {
        setStatus("connecting");
        setStatusText(mode === "join" ? `正在加入房間 ${requestedRoom}...` : "正在建立吹牛私人房間...");

        const room =
          mode === "join"
            ? await client.join<BluffRoomStateSchema>("bluff", { nickname: name, roomCode: requestedRoom, clientId }, BluffRoomStateSchema)
            : await client.create<BluffRoomStateSchema>("bluff", { nickname: name, maxPlayers, bots, difficulty, clientId }, BluffRoomStateSchema);

        if (disposed) {
          await room.leave();
          return;
        }

        roomRef.current = room;
        setOwnPlayerId(`player-${room.sessionId}`);
        setStatus("connected");
        setStatusText(mode === "join" ? "已加入吹牛等待室，等待房主開始遊戲。" : "吹牛房間已建立，分享房號邀請朋友。");
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
            if (!hasStartedDealRef.current && event.cards.length > 0) {
              hasStartedDealRef.current = true;
              setDealAnimation({ active: true, visible: 0 });
            }
            setSelectedIds((current) => current.filter((id) => event.cards.some((card) => card.id === id)));
          }
          if (event.type === "FOUR_OF_KIND_CLEARED") {
            setFourKindNotice(`四張 ${event.rank} 了`);
            setClearingCards(event.cards);
            window.setTimeout(() => {
              setFourKindNotice("");
              setClearingCards([]);
            }, 1200);
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
  const isHost = ownPlayer?.host ?? false;
  const canUseRoom = status === "connected" && !!roomRef.current;
  const canStart = canUseRoom && isHost && phase === "waiting" && rawPlayers.length === (roomState?.maxPlayers ?? 4);
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
    : roomState?.notice || (roomState?.roundClaimRank ? `${lastPlayerName} 加 ${roomState.roundClaimCount} 張 ${roomState.roundClaimRank}` : "等待第一手喊牌");
  const revealedCards = useMemo(
    () => Array.from(roomState?.revealedCards ?? []).map((card) => ({
      id: card.id,
      rank: card.rank as BluffCard["rank"],
      suit: card.suit === "joker" ? null : card.suit as BluffCard["suit"]
    })),
    [roomState, stateVersion]
  );
  const displayNotice = fourKindNotice || notice;

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
    return <UnifiedWaitingRoom
      gameName="吹牛"
      roomCode={roomCode}
      status={status}
      statusText={statusText}
      players={rawPlayers.map((player) => ({ id: player.id, seat: player.seat, nickname: player.nickname, host: player.host, ready: player.ready, type: player.type }))}
      maxPlayers={roomState?.maxPlayers ?? 6}
      ownId={ownPlayerId}
      isHost={isHost}
      canUseRoom={canUseRoom}
      canStart={canStart}
      realOnly
      minPlayers={3}
      onStart={() => send("START_GAME")}
      onLeave={leaveAndCloseRoom}
    />;
  }
  return (
    <main className="bluff-page-shell">
      <BluffTopbar roomCode={roomCode} status={status} onLeave={leaveAndCloseRoom} />

      <RoomTable gameName="吹牛" className="bluff-table-like-ninety">
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

          {displayNotice ? (
            <article className="bluff-claim-card" aria-live="polite">
              <strong>{displayNotice}</strong>
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

        {dealAnimation.active && dealAnimation.visible < hand.length ? (
          <div className="deal-animation-card bluff-deal-animation-card" aria-hidden="true"><div className="deal-card-back" /></div>
        ) : null}

        <section className="bluff-self-zone" aria-label="自己的手牌">
          {fourKindNotice ? <div className="bluff-four-kind-notice" aria-live="polite">{fourKindNotice}</div> : null}
          {clearingCards.length > 0 ? (
            <div className="bluff-clearing-cards" aria-hidden="true">
              {clearingCards.map((card) => <div className="bluff-clearing-card" key={card.id}><PlayingCard card={card} /></div>)}
            </div>
          ) : null}
          <RoomSelfBadge nickname={nickname || "你"} count={hand.length} />

          <div className="bluff-hand">
            {(dealAnimation.active ? hand.slice(0, dealAnimation.visible) : hand).map((card) => (
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
      </RoomTable>

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

function BluffTopbar({ roomCode, status, onLeave }: { roomCode: string; status: ConnectionStatus; onLeave: () => void }) {
  return <RoomHeader gameName="吹牛" roomCode={roomCode} status={status} realOnly docsHref="/docs/games/bluff.md" onLeave={onLeave} />;
}

function OpponentSeat({ player }: { player: { id: string; name: string; cards: number; type: "bot" | "human"; position: SeatPosition } }) {
  return <RoomOpponentSeat player={{ id: player.id, nickname: player.name, cardsRemaining: player.cards, type: player.type }} position={player.position} />;
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

function getTabClientId(scope: string) {
  const key = `poker-${scope}-client-id`;
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const next = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.sessionStorage.setItem(key, next);
  return next;
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
