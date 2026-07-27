"use client";

import { AlertTriangle, BookOpen, Hand, LogOut, ShieldCheck } from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AUTO_PLAY_INTERVAL_MS,
  PENALTY_ALERT_MS,
  SLAP_WINDOW_MS,
  type PenaltyReason,
  type PenaltyResult
} from "../../../lib/games/heart-attack";

type Phase = "playing" | "slap-window" | "round-result" | "finished";
type Suit = "spades" | "hearts" | "diamonds" | "clubs";
type DemoCard = { id: string; rank: string; suit: Suit };
type Seat = "self" | "top" | "left" | "right";
type DemoPlayer = { id: string; nickname: string; seat: Seat; color: "blue" | "yellow" | "cream" | "black" };

const players: DemoPlayer[] = [
  { id: "you", nickname: "阿德", seat: "self", color: "yellow" },
  { id: "hao", nickname: "阿豪", seat: "top", color: "cream" },
  { id: "mi", nickname: "小米", seat: "left", color: "blue" },
  { id: "bear", nickname: "大熊", seat: "right", color: "black" }
];

const demoDeck: DemoCard[] = [
  { id: "d-7", rank: "7", suit: "diamonds" },
  { id: "c-2", rank: "2", suit: "clubs" },
  { id: "h-3", rank: "3", suit: "hearts" },
  { id: "s-4", rank: "4", suit: "spades" },
  { id: "h-5", rank: "5", suit: "hearts" },
  { id: "d-6", rank: "6", suit: "diamonds" },
  { id: "c-7", rank: "7", suit: "clubs" },
  { id: "s-8", rank: "8", suit: "spades" },
  { id: "h-9", rank: "9", suit: "hearts" },
  { id: "d-10", rank: "10", suit: "diamonds" },
  { id: "c-j", rank: "J", suit: "clubs" },
  { id: "h-q", rank: "Q", suit: "hearts" },
  { id: "s-k", rank: "K", suit: "spades" }
];

const suitSymbols: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣"
};

const suitClass: Record<Suit, string> = {
  spades: "black",
  clubs: "black",
  hearts: "red",
  diamonds: "red"
};

const initialCounts = Object.fromEntries(players.map((player) => [player.id, 13])) as Record<string, number>;

export default function HeartAttackAutoPage() {
  const [roomCode, setRoomCode] = useState("582716");
  const [nickname, setNickname] = useState("阿德");
  const [phase, setPhase] = useState<Phase>("playing");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [callNumber, setCallNumber] = useState(7);
  const [turnNumber, setTurnNumber] = useState(1);
  const [playedCard, setPlayedCard] = useState<DemoCard | null>(null);
  const [pileCount, setPileCount] = useState(0);
  const [deckCounts, setDeckCounts] = useState(initialCounts);
  const [message, setMessage] = useState("系統自動翻牌中，看到牌面等於喊數就按拍！");
  const [result, setResult] = useState("等待下一張牌");
  const [flyingCard, setFlyingCard] = useState<DemoCard | null>(null);
  const [penaltyResult, setPenaltyResult] = useState<PenaltyResult | null>(null);
  const [slapCount, setSlapCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get("room");
    const name = params.get("name");
    if (room) setRoomCode(room);
    if (name) setNickname(name);
  }, []);

  const visiblePlayers = useMemo(
    () => players.map((player) => (player.id === "you" ? { ...player, nickname } : player)),
    [nickname]
  );

  const currentPlayer = visiblePlayers[currentIndex];

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (phase === "playing") {
      timerRef.current = setTimeout(playAutomaticCard, AUTO_PLAY_INTERVAL_MS);
    }

    if (phase === "slap-window") {
      timerRef.current = setTimeout(() => {
        openPenalty("no-slap", currentPlayer, Math.max(1, pileCount), null);
      }, SLAP_WINDOW_MS);
    }

    if (phase === "round-result") {
      timerRef.current = setTimeout(() => {
        setPenaltyResult(null);
        setMessage("系統自動翻牌中，看到牌面等於喊數就按拍！");
        setResult("等待下一張牌");
        setPhase("playing");
      }, PENALTY_ALERT_MS);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase, currentIndex, callNumber, turnNumber, pileCount, nickname]);

  function playAutomaticCard() {
    const card = demoDeck[(turnNumber - 1) % demoDeck.length];
    const actor = visiblePlayers[currentIndex];
    const trigger = getCardValue(card.rank) === callNumber;
    const nextCall = getNextCall(callNumber);

    setFlyingCard(card);
    setPlayedCard(card);
    setPileCount((count) => count + 1);
    setDeckCounts((counts) => ({ ...counts, [actor.id]: Math.max(0, (counts[actor.id] ?? 0) - 1) }));
    setTurnNumber((turn) => turn + 1);
    window.setTimeout(() => setFlyingCard(null), 520);

    if (trigger) {
      setResult(`${actor.nickname} 翻出 ${card.rank}，剛好等於喊數 ${callNumber}`);
      setMessage("快拍！現在是唯一可以操作的時間。");
      setPhase("slap-window");
      return;
    }

    setResult(`${actor.nickname} 自動翻出 ${card.rank}，喊數 ${callNumber}`);
    setCallNumber(nextCall);
    setCurrentIndex((index) => (index + 1) % visiblePlayers.length);
  }

  function slap() {
    if (phase === "round-result" || phase === "finished") return;
    setSlapCount((count) => count + 1);

    if (phase === "slap-window" && playedCard) {
      const collected = Math.max(1, pileCount);
      setDeckCounts((counts) => ({ ...counts, you: (counts.you ?? 0) + collected }));
      setPileCount(0);
      setResult(`你拍到 ${playedCard.rank}，收走 ${collected} 張牌`);
      setMessage("拍牌成功，稍等一下系統會繼續自動翻牌。");
      setCurrentIndex(0);
      setCallNumber(getNextCall(callNumber));
      setPhase("round-result");
      return;
    }

    openPenalty("false-slap", visiblePlayers[0], pileCount, null);
  }

  function openPenalty(reason: PenaltyReason, player: DemoPlayer, cardsTaken: number, responseTimeMs: number | null) {
    const taken = Math.max(0, cardsTaken);
    const penalty: PenaltyResult = {
      reason,
      playerId: player.id,
      playerName: player.nickname,
      cardsTaken: taken,
      cardIds: Array.from({ length: taken }).map((_, index) => `center-${turnNumber}-${index}`),
      responseTimeMs,
      occurredAt: Date.now()
    };

    if (timerRef.current) clearTimeout(timerRef.current);
    setPenaltyResult(penalty);
    setDeckCounts((counts) => ({ ...counts, [player.id]: (counts[player.id] ?? 0) + taken }));
    setPileCount(0);
    setCurrentIndex(Math.max(0, visiblePlayers.findIndex((item) => item.id === player.id)));
    setCallNumber(getNextCall(callNumber));
    setResult(`${player.nickname} 收走 ${taken} 張`);
    setMessage("收牌警示顯示中，自動出牌暫停。");
    setPhase("round-result");
  }

  return (
    <main className="heart-auto-shell">
      <header className="heart-auto-header">
        <div className="brand-lockup" aria-label="鬥陣來一局">
          <span className="brand-mark">鬥陣</span>
          <span className="brand-title">心臟病</span>
        </div>
        <div className="header-meta">
          <span>房號 <strong>{formatRoom(roomCode)}</strong></span>
          <span>第 <strong>1</strong> 局</span>
        </div>
        <div className="header-actions">
          <button type="button" className="outline-action"><BookOpen size={21} />玩法</button>
          <button type="button" className="leave-action"><LogOut size={21} />離開牌局</button>
        </div>
      </header>

      <section className={`heart-auto-table phase-${phase}`}>
        {visiblePlayers.filter((player) => player.seat !== "self").map((player) => (
          <Opponent key={player.id} player={player} current={player.id === currentPlayer.id} count={deckCounts[player.id] ?? 0} />
        ))}

        <div className="heart-center">
          <div className="callout-tag">目前喊數</div>
          <div className={`call-number ${phase === "slap-window" ? "danger" : ""}`}>{callNumber}</div>
          <div className="played-stack">
            <div className="pile-shadow" />
            {playedCard ? <PlayingCard card={playedCard} /> : <div className="empty-card">待翻</div>}
          </div>
          <div className="heart-status">
            <strong>{phaseLabel(phase)}</strong>
            <span>{result}</span>
          </div>
          <div className="auto-timer">
            <span>{phase === "playing" ? "自動翻牌倒數" : phase === "slap-window" ? "拍牌判定中" : "回合整理中"}</span>
            <div className="auto-meter"><i key={`${phase}-${turnNumber}-${slapCount}`} /></div>
          </div>
          <div className="pile-count">中央牌堆 {pileCount} 張</div>
        </div>

        {penaltyResult ? (
          <PenaltyAlert
            result={penaltyResult}
            targetPlayerColor={visiblePlayers.find((player) => player.id === penaltyResult.playerId)?.color ?? "yellow"}
            isVisible={phase === "round-result"}
          />
        ) : null}

        {flyingCard ? (
          <div className={`flying-card from-${currentPlayer.seat}`} aria-hidden="true">
            <PlayingCard card={flyingCard} compact />
          </div>
        ) : null}

        <div className="self-zone">
          <PlayerBadge player={visiblePlayers[0]} current={currentPlayer.id === "you"} />
          <div className="self-hand" aria-label="自己的手牌堆">
            {Array.from({ length: Math.min(8, deckCounts.you ?? 0) }).map((_, index) => (
              <div key={index} className="card-back mini" style={{ "--offset": `${index * 13}px` } as CSSProperties}>鬥</div>
            ))}
          </div>
          <div className="self-count">剩餘 {deckCounts.you ?? 0} 張</div>
        </div>

        
      </section>

      <footer className="heart-auto-controls">
        <div>
          <strong>{currentPlayer.id === "you" ? "輪到你了" : `輪到 ${currentPlayer.nickname}`}</strong>
          <span>{message}</span>
        </div>
        <button type="button" className="slap-button" onClick={slap} disabled={phase === "round-result" || phase === "finished"}>
          <Hand size={34} />
          拍！
        </button>
      </footer>
    </main>
  );
}

function Opponent({ player, current, count }: { player: DemoPlayer; current: boolean; count: number }) {
  return (
    <div className={`opponent-seat seat-${player.seat} ${current ? "is-current" : ""}`}>
      <PlayerBadge player={player} current={current} />
      <div className="opponent-hand">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="card-back" style={{ "--tilt": `${(index - 2) * 5}deg` } as CSSProperties}>鬥</div>
        ))}
      </div>
      <div className="seat-count">剩餘 {count} 張</div>
    </div>
  );
}

function PlayerBadge({ player, current }: { player: DemoPlayer; current: boolean }) {
  return (
    <div className={`player-badge badge-${player.color} ${current ? "active" : ""}`}>
      <span className="avatar-letter">{player.nickname.trim().slice(0, 1) || "友"}</span>
      <strong>{player.nickname}</strong>
    </div>
  );
}

function PenaltyAlert({ result, targetPlayerColor, isVisible }: { result: PenaltyResult; targetPlayerColor: string; isVisible: boolean }) {
  const copy = getPenaltyCopy(result);

  return (
    <div
      className={`penalty-alert alert-${targetPlayerColor} ${isVisible ? "show" : ""}`}
      role="status"
      aria-live="assertive"
      aria-atomic="true"
    >
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

function getPenaltyCopy(result: PenaltyResult) {
  switch (result.reason) {
    case "false-slap":
      return {
        label: "誤拍！",
        title: `${result.playerName} 拍錯了`,
        description: "中央牌堆將移到他的牌堆底部"
      };
    case "slowest-slap":
      return {
        label: "最後一位！",
        title: `${result.playerName} 最慢拍桌`,
        description: "中央牌堆將移到他的牌堆底部"
      };
    case "no-slap":
      return {
        label: "沒人拍到！",
        title: `${result.playerName} 沒有被救到`,
        description: "中央牌堆將移到他的牌堆底部"
      };
    case "pending-finish-failed":
      return {
        label: "差點贏了！",
        title: `${result.playerName} 最後失手`,
        description: "收牌後繼續留在牌局中"
      };
  }
}

function PlayingCard({ card, compact = false }: { card: DemoCard; compact?: boolean }) {
  return (
    <div className={`playing-card ${suitClass[card.suit]} ${compact ? "compact" : ""}`}>
      <span>{card.rank}</span>
      <b>{suitSymbols[card.suit]}</b>
      <small>{card.rank}</small>
    </div>
  );
}

function getCardValue(rank: string) {
  if (rank === "A") return 1;
  if (rank === "J") return 11;
  if (rank === "Q") return 12;
  if (rank === "K") return 13;
  return Number(rank);
}

function getNextCall(value: number) {
  return value >= 13 ? 1 : value + 1;
}

function formatRoom(value: string) {
  const clean = value.replace(/\D/g, "").slice(0, 6).padEnd(6, "0");
  return `${clean.slice(0, 3)} ${clean.slice(3)}`;
}

function phaseLabel(phase: Phase) {
  if (phase === "slap-window") return "快拍！";
  if (phase === "round-result") return "收牌警示";
  if (phase === "finished") return "本局結束";
  return "自動翻牌";
}
