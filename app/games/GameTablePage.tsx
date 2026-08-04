"use client";

import { Bot, CheckCircle2, Clock3, GripHorizontal, Hand, LogOut, Play, RotateCcw, ShieldCheck, SkipForward, Sparkles, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getGame, type GameId } from "../data/games";
import { UnifiedWaitingRoom, type UnifiedPlayer } from "./shared/UnifiedGameRoom";

type NinetyNineCard = {
  id: string;
  rank: "4" | "5" | "7" | "10" | "J" | "Q" | "K";
  suit: "clubs" | "diamonds" | "hearts" | "spades";
};

type PendingChoice = "plus10" | "minus10" | "plus20" | "minus20" | "set99" | "reverse" | "choosePlayer" | "pass" | "add";

type MotionCard = {
  id: number;
  card: NinetyNineCard;
  type: "play" | "draw";
};

type DemoHeartCard = {
  id: string;
  rank: string;
  suit: "clubs" | "diamonds" | "hearts" | "spades" | "joker";
};

const initialNinetyNineHand: NinetyNineCard[] = [
  { id: "h1", rank: "4", suit: "clubs" },
  { id: "h2", rank: "5", suit: "hearts" },
  { id: "h3", rank: "10", suit: "diamonds" },
  { id: "h4", rank: "Q", suit: "spades" },
  { id: "h5", rank: "K", suit: "hearts" }
];

const refillDeck: NinetyNineCard[] = [
  { id: "r1", rank: "J", suit: "spades" },
  { id: "r2", rank: "7", suit: "diamonds" },
  { id: "r3", rank: "10", suit: "clubs" },
  { id: "r4", rank: "5", suit: "hearts" },
  { id: "r5", rank: "4", suit: "spades" }
];

const rivals = [
  { name: "阿豪", cards: 5, color: "yellow", position: "top" },
  { name: "小米", cards: 5, color: "cream", position: "left" },
  { name: "大熊", cards: 5, color: "blue", position: "right" }
];

const heartPlayers = [
  { id: "you", name: "阿德", color: "blue", type: "真人" },
  { id: "mimi", name: "小米", color: "yellow", type: "真人" },
  { id: "bear", name: "大熊", color: "cream", type: "電腦" }
];

const heartDemoDeck: DemoHeartCard[] = [
  { id: "ha-1", rank: "7", suit: "diamonds" },
  { id: "ha-2", rank: "8", suit: "clubs" },
  { id: "ha-3", rank: "9", suit: "hearts" },
  { id: "ha-4", rank: "J", suit: "spades" },
  { id: "ha-5", rank: "Q", suit: "hearts" },
  { id: "ha-6", rank: "K", suit: "clubs" },
  { id: "ha-7", rank: "A", suit: "spades" },
  { id: "ha-8", rank: "JOKER", suit: "joker" }
];

const routeNotes: Record<GameId, string[]> = {
  big2: ["牌型比較", "合法出牌", "先出完勝利"],
  sevens: ["七點起排", "同花色接龍", "卡牌扣分"],
  "red-dot": ["翻牌配對", "紅牌計分", "回合收牌"],
  "ninety-nine": ["累積點數", "特殊牌效果", "爆掉判定"],
  liar: ["喊牌", "質疑", "揭牌結算"],
  "heart-attack": ["真人同步", "拍牌延遲", "公平判定"],
  "old-maid": ["真人抽牌", "鬼牌追蹤", "配對丟牌"]
};

const rankOrder: Record<NinetyNineCard["rank"], number> = {
  "4": 4,
  "5": 5,
  "7": 7,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13
};

export default function GameTablePage({ gameId }: { gameId: GameId }) {
  const game = getGame(gameId);
  const [roomCode, setRoomCode] = useState("582716");
  const [nickname, setNickname] = useState("阿德");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRoomCode(params.get("room") || "582716");
    setNickname(params.get("nick") || "阿德");
  }, []);

  if (game.id === "ninety-nine") {
    return <NinetyNineTable roomCode={roomCode} nickname={nickname} />;
  }

  if (game.id === "heart-attack") {
    return <HeartAttackTable roomCode={roomCode} nickname={nickname} />;
  }

  if (game.id === "big2" || game.id === "sevens" || game.id === "red-dot") {
    return <SharedStaticWaitingRoom game={game} roomCode={roomCode} nickname={nickname} />;
  }

  return (
    <main className="site-shell">
      <section className="game-shell">
        <GameHeader gameName={game.name} roomCode={roomCode} round={1} />

        <div className="coming-table">
          <div className="coming-title">
            <p className="stamp">專屬牌桌已建立</p>
            <h1>{game.name}</h1>
            {game.realOnly && <strong className="real-only table-tag">只限真人</strong>}
          </div>

          <div className="coming-grid">
            {routeNotes[game.id].map((item) => (
              <div className="coming-card" key={item}>
                <ShieldCheck />
                <strong>{item}</strong>
                <span>下一階段由伺服器規則引擎驗證。</span>
              </div>
            ))}
          </div>

          <div className="placeholder-table">
            <Opponent name="小萱" cards={5} color="yellow" />
            <div className="placeholder-center">
              <span>目前玩家</span>
              <strong>{nickname}</strong>
              <em>{game.status}</em>
            </div>
            <Opponent name={game.realOnly ? "怡君" : "電腦阿明"} cards={5} color="blue" />
          </div>
        </div>
      </section>
    </main>
  );
}

function SharedStaticWaitingRoom({ game, roomCode, nickname }: { game: NonNullable<ReturnType<typeof getGame>>; roomCode: string; nickname: string }) {
  const [ready, setReady] = useState(false);
  const players: UnifiedPlayer[] = [{ id: "self", seat: 0, nickname: nickname || "玩家", host: true, ready, type: "human" }];
  return <UnifiedWaitingRoom
    gameName={game.name}
    roomCode={roomCode}
    status="connected"
    statusText={`${game.name} 房間已建立，分享房號邀請朋友。`}
    players={players}
    maxPlayers={game.max}
    ownId="self"
    isHost
    canUseRoom
    canStart={false}
    allowBots={Boolean(game.bots)}
    realOnly={Boolean(game.realOnly)}
    minPlayers={game.min}
    onReady={() => setReady((value) => !value)}
    onStart={() => undefined}
    onLeave={() => { window.location.href = "/"; }}
  />;
}

function StaticWaitingRoom({ game, roomCode, nickname }: { game: NonNullable<ReturnType<typeof getGame>>; roomCode: string; nickname: string }) {
  const [ready, setReady] = useState(false);
  const emptySeatCount = Math.max(0, game.max - 1);

  return (
    <main className="heart-auto-shell ninety-online-shell">
      <GameHeader gameName={game.name} roomCode={roomCode} round={1} />
      <section className="heart-waiting-room ninety-waiting-room">
        <div className="waiting-room-title">
          <span className="stamp">等待室</span>
          <h1>{game.name} 房間</h1>
        </div>
        <div className="waiting-room-code">
          <span>{formatRoom(roomCode)}</span>
          <button type="button" onClick={() => navigator.clipboard?.writeText(roomCode)}>複製房號</button>
        </div>
        <div className="heart-lobby-list ninety-lobby-list">
          <article className={`heart-lobby-seat lobby-yellow ${ready ? "ready" : ""}`}>
            <span className="lobby-card-corner">{(nickname || "玩").slice(0, 1)}</span>
            <span>座位 1 · 房主</span>
            <strong>{nickname || "阿德"}（你）</strong>
            <em>真人玩家</em>
            <b>{ready ? "已準備" : "未準備"}</b>
          </article>
          {Array.from({ length: emptySeatCount }).map((_, index) => (
            <LobbyEmptySeat key={`empty-${index}`} seatNumber={index + 2} />
          ))}
        </div>
        <div className="heart-lobby-actions">
          <button type="button" className={`ready-button ${ready ? "is-ready" : ""}`} onClick={() => setReady((value) => !value)}>
            <CheckCircle2 size={22} />
            {ready ? "取消準備" : "我準備好了"}
          </button>
          {game.bots ? (
            <button type="button" className="ready-button bot-button" disabled>
              <Bot size={22} />
              加電腦補位
            </button>
          ) : null}
          <button type="button" className="play-card-button compact-action" disabled>
            <Play size={20} />
            開始遊戲
          </button>
        </div>
        <p className="waiting-room-hint">{game.name}支援 {game.players}，電腦補位會自動顯示已準備；全員準備後由房主開始。</p>
        <p className="connection-note connected">已加入{game.name}等待室，請切換準備狀態。</p>
      </section>
    </main>
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

function formatRoom(value: string) {
  const clean = value.replace(/\D/g, "").slice(0, 6).padEnd(6, "-");
  return `${clean.slice(0, 3)} ${clean.slice(3)}`;
}

function HeartAttackTable({ roomCode, nickname }: { roomCode: string; nickname: string }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [callNumber, setCallNumber] = useState(7);
  const [turnNumber, setTurnNumber] = useState(1);
  const [deckCounts, setDeckCounts] = useState<Record<string, number>>({ you: 20, mimi: 20, bear: 20 });
  const [centerPileCount, setCenterPileCount] = useState(0);
  const [playedCard, setPlayedCard] = useState<DemoHeartCard | null>(null);
  const [phase, setPhase] = useState<"playing" | "slap-window" | "round-result" | "finished">("playing");
  const [message, setMessage] = useState("輪到你翻牌，喊數 7");
  const [slapCountdown, setSlapCountdown] = useState(0);
  const [botDifficulty, setBotDifficulty] = useState<"easy" | "normal" | "hard">("normal");
  const [result, setResult] = useState("只限真人正式遊玩，目前為本機互動原型。");
  const [pendingFinish, setPendingFinish] = useState<string | null>(null);
  const [flipMotion, setFlipMotion] = useState(false);

  const currentPlayer = heartPlayers[currentIndex];
  const isTrigger = playedCard ? heartCardValue(playedCard) === callNumber : false;

  useEffect(() => {
    if (phase !== "slap-window") return;

    setSlapCountdown(15);
    const countdown = window.setInterval(() => {
      setSlapCountdown((value) => Math.max(0, value - 1));
    }, 100);

    const missWindow = window.setTimeout(() => {
      setPhase("round-result");
      setResult("沒有人拍到，翻出觸發牌的玩家收走中央牌堆。");
      awardPile(currentPlayer.id);
    }, 1500);

    const botDelay = getDemoBotDelay(botDifficulty);
    const botTimer = window.setTimeout(() => {
      if (currentPlayer.id !== "bear") {
        setPhase("round-result");
        setResult(`大熊 ${botDelay}ms 拍到！中央牌堆歸大熊。`);
        awardPile("bear");
      }
    }, botDelay);

    return () => {
      window.clearInterval(countdown);
      window.clearTimeout(missWindow);
      window.clearTimeout(botTimer);
    };
  }, [phase, botDifficulty, currentPlayer.id]);

  function flipCard() {
    if (phase === "finished" || phase === "slap-window") return;

    const card = heartDemoDeck[(turnNumber - 1) % heartDemoDeck.length];
    const player = currentPlayer;
    const nextPileCount = centerPileCount + 1;
    const trigger = heartCardValue(card) === callNumber;

    setFlipMotion(true);
    window.setTimeout(() => setFlipMotion(false), 420);
    setPlayedCard(card);
    setCenterPileCount(nextPileCount);
    setDeckCounts((counts) => ({
      ...counts,
      [player.id]: Math.max(0, counts[player.id] - 1)
    }));

    if ((deckCounts[player.id] ?? 0) <= 1) {
      setPendingFinish(player.id);
    }

    if (trigger) {
      setPhase("slap-window");
      setMessage(`${player.name} 翻出 ${card.rank}，喊數也中！快拍！`);
      setResult("觸發拍牌窗口：1.5 秒內最快拍到的人收牌。");
      return;
    }

    const nextIndex = (currentIndex + 1) % heartPlayers.length;
    setPhase("playing");
    setCurrentIndex(nextIndex);
    setCallNumber(nextCall(callNumber));
    setTurnNumber((value) => value + 1);
    setMessage(`輪到 ${heartPlayers[nextIndex].name}，下一個喊數 ${nextCall(callNumber)}`);

    if (pendingFinish === heartPlayers[nextIndex].id) {
      setPhase("finished");
      setResult(`${heartPlayers[nextIndex].name} 安全撐過一輪，獲勝！`);
    }
  }

  function slap(playerId = "you") {
    if (phase === "finished") return;

    if (phase === "slap-window" && isTrigger) {
      setPhase("round-result");
      setResult(`${heartPlayers.find((player) => player.id === playerId)?.name ?? "玩家"} 正確拍牌，收走 ${centerPileCount} 張中央牌。`);
      awardPile(playerId);
      return;
    }

    setPhase("round-result");
    setResult(`${heartPlayers.find((player) => player.id === playerId)?.name ?? "玩家"} 錯拍，必須收走中央牌堆。`);
    awardPile(playerId);
  }

  function awardPile(playerId: string) {
    setDeckCounts((counts) => ({
      ...counts,
      [playerId]: counts[playerId] + centerPileCount
    }));
    setCenterPileCount(0);
  }

  function nextRound() {
    if (phase === "finished") return;
    const nextIndex = (currentIndex + 1) % heartPlayers.length;
    const nextPlayer = heartPlayers[nextIndex];

    if (pendingFinish === nextPlayer.id) {
      setPhase("finished");
      setResult(`${nextPlayer.name} 沒有拿回牌，pendingFinish 成功，獲勝！`);
      return;
    }

    setPhase("playing");
    setCurrentIndex(nextIndex);
    setCallNumber(nextCall(callNumber));
    setTurnNumber((value) => value + 1);
    setMessage(`輪到 ${nextPlayer.name}，喊數 ${nextCall(callNumber)}`);
  }

  return (
    <main className="game-page-shell">
      <section className="heart-table-shell" aria-labelledby="heart-title">
        <GameHeader gameName="心臟病" roomCode={roomCode} round={turnNumber} />

        <div className="heart-felt">
          <div className="heart-player-row">
            {heartPlayers.map((player, index) => (
              <article className={`heart-player-card ${currentIndex === index ? "active" : ""}`} key={player.id}>
                <div className={`text-avatar ${player.color}`}>{(player.id === "you" ? nickname : player.name).slice(0, 1)}</div>
                <strong>{player.id === "you" ? nickname : player.name}</strong>
                <span>{player.type}</span>
                <em>{deckCounts[player.id]} 張</em>
                {pendingFinish === player.id && <b>pendingFinish</b>}
              </article>
            ))}
          </div>

          <div className="heart-center">
            <div className="call-number-card">
              <span>喊數</span>
              <strong>{callNumber}</strong>
              <em>下一位喊 {nextCall(callNumber)}</em>
            </div>

            <div className={`heart-played-card ${flipMotion ? "flipping" : ""}`}>
              {playedCard ? <HeartCard card={playedCard} /> : <div className="heart-card-back">鬥陣</div>}
              <span>中央 {centerPileCount} 張</span>
            </div>

            <div className={`slap-status ${phase === "slap-window" ? "danger" : ""}`}>
              <strong>{phase === "slap-window" ? "拍！" : "等待翻牌"}</strong>
              <span>{phase === "slap-window" ? `${(slapCountdown / 10).toFixed(1)} 秒` : message}</span>
            </div>
          </div>

          <div className="heart-actions">
            <button className="flip-button" onClick={flipCard} disabled={phase === "slap-window" || phase === "finished"} type="button">
              <Play size={22} />
              翻牌
            </button>
            <button className="slap-button" onClick={() => slap("you")} disabled={phase === "finished"} type="button">
              <Hand size={24} />
              拍！
            </button>
            {phase === "round-result" && (
              <button className="next-turn-button" onClick={nextRound} type="button">
                下一回合
              </button>
            )}
          </div>

          <div className="heart-side-panel">
            <p className="stamp">反應設定</p>
            <div className="segmented compact" aria-label="電腦反應難度">
              {(["easy", "normal", "hard"] as const).map((level) => (
                <button className={botDifficulty === level ? "selected" : ""} key={level} onClick={() => setBotDifficulty(level)} type="button">
                  {level === "easy" ? "簡單" : level === "normal" ? "普通" : "困難"}
                </button>
              ))}
            </div>
            <strong>{result}</strong>
            <span>正式多人版會由伺服器判定拍牌時間，這裡只展示本機流程。</span>
          </div>
        </div>
      </section>
    </main>
  );
}

function NinetyNineTable({ roomCode, nickname }: { roomCode: string; nickname: string }) {
  const [hand, setHand] = useState<NinetyNineCard[]>(initialNinetyNineHand);
  const [selectedCardId, setSelectedCardId] = useState("h4");
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [total, setTotal] = useState(67);
  const [lastCard, setLastCard] = useState<NinetyNineCard>({ id: "last", rank: "7", suit: "diamonds" });
  const [currentPlayer, setCurrentPlayer] = useState("你");
  const [round, setRound] = useState(1);
  const [turnSeconds, setTurnSeconds] = useState(18);
  const [direction, setDirection] = useState<"順時針" | "逆時針">("順時針");
  const [chosenNext, setChosenNext] = useState("阿豪");
  const [refillIndex, setRefillIndex] = useState(0);
  const [motionCard, setMotionCard] = useState<MotionCard | null>(null);

  const selectedCard = useMemo(() => hand.find((card) => card.id === selectedCardId) ?? hand[0], [hand, selectedCardId]);
  const selectedChoice = getDefaultChoice(selectedCard);
  const passAllowed = selectedCard?.rank === "J";

  function playSelectedCard(choice: PendingChoice = selectedChoice) {
    if (!selectedCard || motionCard) return;

    const nextTotal = resolveNinetyNineTotal(total, selectedCard, choice);
    const nextCard = refillDeck[refillIndex % refillDeck.length];
    const nextCardId = `${nextCard.id}-${round}`;

    setMotionCard({ id: Date.now(), card: selectedCard, type: "play" });

    window.setTimeout(() => {
      setTotal(nextTotal);
      setLastCard(selectedCard);
      setCurrentPlayer(choice === "choosePlayer" ? chosenNext : "小米");
      setTurnSeconds(30);

      if (choice === "reverse") {
        setDirection((value) => (value === "順時針" ? "逆時針" : "順時針"));
      }

      setMotionCard({ id: Date.now() + 1, card: nextCard, type: "draw" });

      window.setTimeout(() => {
        setHand((current) => current.map((card) => (card.id === selectedCard.id ? { ...nextCard, id: nextCardId } : card)));
        setSelectedCardId(nextCardId);
        setRound((value) => value + 1);
        setRefillIndex((value) => value + 1);
        setMotionCard(null);
      }, 360);
    }, 420);
  }

  function moveSelectedCard(directionOffset: -1 | 1) {
    setHand((current) => {
      const index = current.findIndex((card) => card.id === selectedCardId);
      const targetIndex = index + directionOffset;
      if (index < 0 || targetIndex < 0 || targetIndex >= current.length) return current;

      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }

  function sortHand() {
    setHand((current) => [...current].sort((left, right) => rankOrder[left.rank] - rankOrder[right.rank]));
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

  return (
    <main className="game-page-shell">
      <section className="ninety-nine-table reference-look" aria-labelledby="table-title">
        <GameHeader gameName="九九" roomCode={roomCode} round={round} />

        <div className="felt-table">
          {rivals.map((rival) => (
            <Opponent key={rival.name} {...rival} />
          ))}

          <div className="score-zone" aria-live="polite">
            <div className="score-burst" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="score-hub compact">
              <span>目前累積</span>
              <strong>{total}</strong>
            </div>
            <div className="last-card-stack" aria-label="上一張出牌">
              <PlayingCard card={lastCard} compact />
              <i />
              <i />
            </div>
          </div>

          <div className="turn-callout">
            <strong>{currentPlayer === "你" ? "輪到你了！" : `輪到 ${currentPlayer}`}</strong>
            <span className="turn-clock">
              <Clock3 size={18} />
              {turnSeconds}
            </span>
            <em>{direction}</em>
          </div>

          {motionCard && (
            <div className={`motion-card ${motionCard.type}`} key={motionCard.id} aria-hidden="true">
              <PlayingCard card={motionCard.card} compact />
            </div>
          )}

          <div className="deck-pile" aria-label="抽牌牌堆">
            <i />
            <i />
            <i />
          </div>

          <div className="player-zone on-table">
            <div className="player-badge">
              <div className="text-avatar blue">{(nickname || "我").slice(0, 1)}</div>
              <div>
                <span>你的手牌</span>
                <strong>{nickname || "阿德"}</strong>
              </div>
            </div>

            <div className="ninety-nine-hand fan-hand" aria-label="自己的五張手牌">
              {hand.map((card, index) => (
                <button
                  className={`ninety-nine-card face-card fan-${index} ${selectedCardId === card.id ? "selected" : ""}`}
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
              ))}
            </div>

            <div className="hand-tools" aria-label="整理手牌">
              <button onClick={() => moveSelectedCard(-1)} type="button">
                <GripHorizontal size={18} />
                左移
              </button>
              <button onClick={() => moveSelectedCard(1)} type="button">
                <GripHorizontal size={18} />
                右移
              </button>
              <button onClick={sortHand} type="button">依點數整理</button>
            </div>
          </div>
        </div>

        <div className="bottom-command-bar">
          <SpecialCardOptions card={selectedCard} chosenNext={chosenNext} onChooseNext={setChosenNext} onPlay={playSelectedCard} />
          <div className="play-controls docked">
            {passAllowed && (
              <button className="pass-button" onClick={() => playSelectedCard("pass")} type="button">
                <SkipForward size={20} />
                Pass
              </button>
            )}
            <button className="play-card-button" onClick={() => playSelectedCard()} type="button">
              <Play size={20} />
              出牌
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

function GameHeader({ gameName, roomCode, round }: { gameName: string; roomCode: string; round: number }) {
  return (
    <header className="game-topbar image-style">
      <a className="table-logo sticker-logo" href="/" aria-label="回到鬥陣來一局首頁">
        鬥陣
      </a>
      <div className="table-title-pack inline-title">
        <h2 id="table-title">{gameName}</h2>
      </div>
      <div className="table-meta">
        <span>房號 <b>{roomCode}</b></span>
        <span>第 <b>{round}</b> 局</span>
      </div>
      <div className="topbar-actions">
        <button type="button">
          <Sparkles size={19} />
          玩法
        </button>
        <a className="leave" href="/">
          <LogOut size={19} />
          離開牌局
        </a>
      </div>
    </header>
  );
}

function Opponent({ name, cards, color, position }: { name: string; cards: number; color: string; position?: string }) {
  return (
    <article className={`rival-seat portrait-seat ${position ?? ""}`}>
      <div className={`text-avatar ${color}`}>{name.slice(0, 1)}</div>
      <div className="name-stack">
        <strong>{name}</strong>
        <span>剩餘 {cards} 張</span>
      </div>
      <div className="card-back-stack wide" aria-label={`${name} 的牌背`}>
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
    </article>
  );
}

function SpecialCardOptions({
  card,
  chosenNext,
  onChooseNext,
  onPlay
}: {
  card?: NinetyNineCard;
  chosenNext: string;
  onChooseNext: (name: string) => void;
  onPlay: (choice: PendingChoice) => void;
}) {
  if (!card) return null;

  if (card.rank === "4") {
    return (
      <div className="special-card-panel pill-panel">
        <RotateCcw size={22} />
        <strong>迴轉提示</strong>
        <button onClick={() => onPlay("reverse")} type="button">迴轉出牌</button>
      </div>
    );
  }

  if (card.rank === "5") {
    return (
      <div className="special-card-panel pill-panel">
        <Users size={22} />
        <strong>指定下一位</strong>
        <select value={chosenNext} onChange={(event) => onChooseNext(event.target.value)} aria-label="選擇下一位玩家">
          {rivals.map((rival) => (
            <option key={rival.name} value={rival.name}>
              {rival.name}
            </option>
          ))}
        </select>
        <button onClick={() => onPlay("choosePlayer")} type="button">指定</button>
      </div>
    );
  }

  if (card.rank === "10") {
    return (
      <div className="special-card-panel choice-panel">
        <button onClick={() => onPlay("plus10")} type="button">+10</button>
        <button onClick={() => onPlay("minus10")} type="button">-10</button>
      </div>
    );
  }

  if (card.rank === "J") {
    return (
      <div className="special-card-panel pill-panel">
        <SkipForward size={22} />
        <strong>J 可 Pass</strong>
      </div>
    );
  }

  if (card.rank === "Q") {
    return (
      <div className="special-card-panel choice-panel">
        <button onClick={() => onPlay("plus20")} type="button">+20</button>
        <button onClick={() => onPlay("minus20")} type="button">-20</button>
      </div>
    );
  }

  if (card.rank === "K") {
    return (
      <div className="special-card-panel pill-panel">
        <strong>K 設為 99</strong>
        <button onClick={() => onPlay("set99")} type="button">設為 99</button>
      </div>
    );
  }

  return (
    <div className="special-card-panel pill-panel">
      <strong>{card.rank} 加點牌</strong>
    </div>
  );
}

function HeartCard({ card }: { card: DemoHeartCard }) {
  const red = card.suit === "diamonds" || card.suit === "hearts";

  return (
    <div className={`heart-card-face ${red ? "red" : "black"} ${card.rank === "JOKER" ? "joker" : ""}`}>
      <span>{card.rank === "JOKER" ? "鬼" : card.rank}</span>
      <em>{heartSuitSymbol(card.suit)}</em>
      <strong>{card.rank === "JOKER" ? "JOKER" : card.rank}</strong>
    </div>
  );
}

function PlayingCard({ card, compact = false }: { card: NinetyNineCard; compact?: boolean }) {
  const red = card.suit === "diamonds" || card.suit === "hearts";

  return (
    <div className={`card-face ${compact ? "compact" : ""} ${red ? "red" : "black"}`}>
      <span>{card.rank}</span>
      <em>{suitSymbol(card.suit)}</em>
      {!compact && <strong>{card.rank}</strong>}
    </div>
  );
}

function heartSuitSymbol(suit: DemoHeartCard["suit"]) {
  if (suit === "clubs") return "♣";
  if (suit === "diamonds") return "♦";
  if (suit === "hearts") return "♥";
  if (suit === "spades") return "♠";
  return "★";
}

function heartCardValue(card: DemoHeartCard) {
  if (card.rank === "A") return 1;
  if (card.rank === "J") return 11;
  if (card.rank === "Q") return 12;
  if (card.rank === "K") return 13;
  if (card.rank === "JOKER") return null;
  return Number(card.rank);
}

function nextCall(callNumber: number) {
  return callNumber >= 13 ? 1 : callNumber + 1;
}

function getDemoBotDelay(difficulty: "easy" | "normal" | "hard") {
  if (difficulty === "easy") return 980;
  if (difficulty === "hard") return 420;
  return 680;
}

function suitSymbol(suit: NinetyNineCard["suit"]) {
  if (suit === "clubs") return "♣";
  if (suit === "diamonds") return "♦";
  if (suit === "hearts") return "♥";
  return "♠";
}

function getDefaultChoice(card?: NinetyNineCard): PendingChoice {
  if (!card) return "add";
  if (card.rank === "4") return "reverse";
  if (card.rank === "5") return "choosePlayer";
  if (card.rank === "10") return "plus10";
  if (card.rank === "J") return "pass";
  if (card.rank === "Q") return "plus20";
  if (card.rank === "K") return "set99";
  return "add";
}

function resolveNinetyNineTotal(total: number, card: NinetyNineCard, choice: PendingChoice) {
  if (choice === "minus10") return Math.max(0, total - 10);
  if (choice === "plus10") return Math.min(99, total + 10);
  if (choice === "minus20") return Math.max(0, total - 20);
  if (choice === "plus20") return Math.min(99, total + 20);
  if (choice === "set99") return 99;
  if (choice === "pass" || choice === "reverse" || choice === "choosePlayer") return total;
  return Math.min(99, total + Number(card.rank));
}
