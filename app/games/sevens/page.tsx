"use client";

import { CheckCircle2, Layers3, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Client, type Room } from "colyseus.js";
import { getBotPlayerNameForDifficulty } from "../../../lib/games/core/botNames";
import type { Rank, Suit } from "../../../lib/games/core/cards";
import {
  SEVENS_RANKS,
  SEVENS_SUITS,
  applySevensAction,
  calculateBotMove,
  calculateClassicScore,
  canCoverCard,
  canPlayCard,
  createSevensGame,
  getLegalPlays,
  getSevensBotDelayMs,
  getSlotId,
  type SevensCard,
  type SevensMode,
  type SevensPlayer,
  type SevensState
} from "../../../lib/games/sevens";
import { useBgmMode } from "../../SoundProvider";
import { RoomHeader, RoomTable, UnifiedWaitingRoom, type RoomPlayer } from "../room";
import type { SevensServerEvent } from "../../../server/messages/sevensMessages";
import { SevensRoomStateSchema, type PublicSevensPlayer } from "../../../server/schema/SevensRoomState";

type DragState =
  | { status: "idle" }
  | { status: "dragging"; cardId: string; validSlot: string }
  | { status: "returning"; cardId: string }
  | { status: "submitting"; cardId: string };

type ConnectionStatus = "connecting" | "connected" | "error" | "closed";
type CoverFlyCard = { id: string; playerId: string; card: SevensCard; nonce: number };
const gameServerUrl = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "ws://localhost:2567";
const suitLabel: Record<Suit, string> = { spades: "黑桃", hearts: "紅心", diamonds: "方塊", clubs: "梅花" };
const suitMark: Record<Suit, string> = { spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" };
const positionName = ["南", "西", "北", "東", "座五", "座六", "座七", "座八"];

export default function SevensPage() {
  const [selfId, setSelfId] = useState("");
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [statusText, setStatusText] = useState("正在連線...");
  const [createdAsHost, setCreatedAsHost] = useState(false);
  const [serverState, setServerState] = useState<SevensRoomStateSchema | null>(null);
  const [serverVersion, setServerVersion] = useState(0);
  const [serverPlayers, setServerPlayers] = useState<RoomPlayer[]>([]);
  const [privateHand, setPrivateHand] = useState<SevensCard[]>([]);
  const roomRef = useRef<Room<SevensRoomStateSchema> | null>(null);
  const [screen, setScreen] = useState<"waiting" | "playing">("waiting");
  const [mode, setMode] = useState<SevensMode>("classic-four");
  const [roomCode, setRoomCode] = useState("------");
  const [round, setRound] = useState(1);
  const [playerCount, setPlayerCount] = useState(4);
  const [game, setGame] = useState<SevensState | null>(null);
  const [selectedCardId, setSelectedCardId] = useState("");
  const [dragState, setDragState] = useState<DragState>({ status: "idle" });
  const [coverFlyCard, setCoverFlyCard] = useState<CoverFlyCard | null>(null);
  const [notice, setNotice] = useState("等待玩家準備");
  useBgmMode(screen === "waiting" ? "lobby" : "playing");

  useEffect(() => {
    let disposed = false;
    const params = new URLSearchParams(window.location.search);
    const joinMode = params.get("mode") === "join";
    setCreatedAsHost(!joinMode);
    const requestedRoom = (params.get("room") ?? "").replace(/\D/g, "").slice(0, 6);
    const name = params.get("name")?.trim() || params.get("nickname")?.trim() || "玩家";
    const requestedMode: SevensMode = params.get("sevensMode") === "double-deck-race" ? "double-deck-race" : "classic-four";
    const requestedPlayers = Number(params.get("players") ?? (requestedMode === "classic-four" ? 4 : 5));
    const bots = Number(params.get("bots") ?? 0);
    const difficulty = parseDifficulty(params.get("difficulty"));
    const clientId = getTabClientId("sevens");
    const client = new Client(gameServerUrl);

    const syncState = (next: SevensRoomStateSchema, fallbackCode: string) => {
      setServerState(next);
      setServerVersion((value) => value + 1);
      setRoomCode(next.roomCode || fallbackCode);
      setMode(next.mode as SevensMode);
      setPlayerCount(next.maxPlayers);
      setRound(next.round);
      setScreen(next.phase === "waiting" ? "waiting" : "playing");
      setNotice(next.notice);
      setServerPlayers(Array.from(next.players).map((player) => ({
        id: player.id,
        seat: player.seat,
        nickname: player.nickname,
        host: player.host,
        ready: player.ready,
        connected: player.connected,
        type: player.type as "human" | "bot",
        botDifficulty: player.botDifficulty
      })));
    };

    async function connect() {
      try {
        const room = joinMode
          ? await client.join<SevensRoomStateSchema>("sevens", { nickname: name, roomCode: requestedRoom, clientId }, SevensRoomStateSchema)
          : await client.create<SevensRoomStateSchema>("sevens", { nickname: name, mode: requestedMode, maxPlayers: requestedPlayers, bots, difficulty, clientId }, SevensRoomStateSchema);
        if (disposed) { await room.leave(); return; }
        roomRef.current = room;
        setSelfId(`player-${room.sessionId}`);
        setStatus("connected");
        setStatusText(joinMode ? "已加入排七等待室，等待房主開始遊戲。" : "排七房間已建立，分享房號邀請朋友。");
        syncState(room.state, room.roomId.slice(0, 6));
        room.onStateChange((next) => syncState(next, room.roomId.slice(0, 6)));
        room.onMessage<SevensServerEvent>("sevens:event", (event) => {
          if (event.type === "PRIVATE_HAND") {
            setPrivateHand(event.cards);
            setSelectedCardId((current) => event.cards.some((card) => card.id === current) ? current : "");
          }
          if (event.type === "CARD_COVERED") {
            setCoverFlyCard({ id: `${event.playerId}-${event.card.id}-${Date.now()}`, playerId: event.playerId, card: event.card, nonce: Date.now() });
            window.setTimeout(() => setCoverFlyCard((current) => current?.card.id === event.card.id ? null : current), 720);
          }
          if (event.type === "ACTION_REJECTED") setStatusText(errorLabel(event.reason));
          if (event.type === "ROOM_CLOSED") window.location.href = "/";
        });
        room.onError((_code, message) => { setStatus("error"); setStatusText(message ?? "排七房間連線錯誤"); });
        room.onLeave(() => { if (!disposed) setStatus("closed"); });
      } catch (error) {
        setStatus("error");
        setStatusText(error instanceof Error ? error.message : "無法連線到排七房間");
      }
    }

    connect();
    return () => { disposed = true; roomRef.current?.leave(); roomRef.current = null; };
  }, []);

  useEffect(() => {
    if (!serverState || !selfId) return;
    setGame(createClientGame(serverState, selfId, privateHand));
  }, [serverState, serverVersion, selfId, privateHand]);

  const lobbyPlayers = useMemo(() => serverPlayers.length ? serverPlayers : createLobbyPlayers(playerCount, selfId || "player-you"), [serverPlayers, playerCount, selfId]);
  const ownHand = game?.hands[selfId] ?? [];
  const legalCards = useMemo(() => game ? getLegalPlays(game, selfId) : [], [game]);
  const legalIds = useMemo(() => new Set(legalCards.map((card) => card.id)), [legalCards]);
  const isMyTurn = game?.currentPlayerId === selfId && game.phase === "playing";
  const canCover = isMyTurn;
  const currentPlayer = game?.players.find((player) => player.id === game.currentPlayerId);
  const ownPublicPlayer = serverState ? Array.from(serverState.players).find((player) => player.id === selfId) : null;
  const ownCoveredCards = game?.coveredCards[selfId] ?? [];
  const ownCoveredCount = ownPublicPlayer?.coveredCount ?? ownCoveredCards.length;
  const ownCoveredPoints = ownPublicPlayer?.coveredPoints ?? calculateClassicScore(ownCoveredCards);

  useEffect(() => {
    if (roomRef.current || !game || game.phase !== "playing" || game.currentPlayerId === selfId) return;
    const bot = game.players.find((player) => player.id === game.currentPlayerId);
    if (!bot || bot.type !== "bot") return;
    const timer = window.setTimeout(() => {
      setGame((current) => {
        if (!current || current.phase !== "playing" || current.currentPlayerId !== bot.id) return current;
        const move = calculateBotMove(current, bot.id, bot.botDifficulty ?? "normal", Math.random);
        if (!move) return current;
        const next = applySevensAction(current, { ...move, playerId: bot.id, timestamp: Date.now() });
        setNotice(move.type === "PLAY_CARD" ? `${bot.nickname} ?銝撘萇?` : `${bot.nickname} ??銝撘萇?`);
        return next;
      });
    }, getSevensBotDelayMs());
    return () => window.clearTimeout(timer);
  }, [game]);

  function startGame() {
    if (roomRef.current) { send("START_GAME"); return; }
    const next = createSevensGame({
      mode,
      players: lobbyPlayers.map((player) => ({
        id: player.id,
        nickname: player.nickname,
        type: player.type === "bot" ? "bot" : "human",
        botDifficulty: player.type === "bot" ? "normal" : undefined
      })),
      seed: Date.now()
    });
    setGame(next);
    setScreen("playing");
    setSelectedCardId("");
    setDragState({ status: "idle" });
    setNotice("第一手請打黑桃 7");
  }

  function submitPlay(cardId: string, slotId: string) {
    if (!game || !canPlayCard(game, selfId, cardId)) {
      returnCard(cardId, "這張牌現在不能出");
      return;
    }
    const card = ownHand.find((item) => item.id === cardId);
    if (!card || getSlotId(card.suit, card.rank) !== slotId) {
      returnCard(cardId, "請拖到正確的位置");
      return;
    }
    setDragState({ status: "submitting", cardId });
    if (roomRef.current) {
      send("PLAY_CARD", { cardId });
      setSelectedCardId("");
      window.setTimeout(() => setDragState({ status: "idle" }), 180);
      return;
    }
    setGame((current) => current ? applySevensAction(current, { type: "PLAY_CARD", playerId: selfId, cardId, timestamp: Date.now() }) : current);
    setNotice(`你打出 ${suitMark[card.suit]} ${card.rank}`);
    setSelectedCardId("");
    window.setTimeout(() => setDragState({ status: "idle" }), 180);
  }

  function returnCard(cardId: string, message: string) {
    setDragState({ status: "returning", cardId });
    setNotice(message);
    window.setTimeout(() => setDragState({ status: "idle" }), 260);
  }

  function coverSelected() {
    if (!game || !selectedCardId || !canCoverCard(game, selfId, selectedCardId)) return;
    if (roomRef.current) { send("COVER_CARD", { cardId: selectedCardId }); setSelectedCardId(""); return; }
    const card = ownHand.find((item) => item.id === selectedCardId);
    if (card) {
      setCoverFlyCard({ id: `${selfId}-${card.id}-${Date.now()}`, playerId: selfId, card, nonce: Date.now() });
      window.setTimeout(() => setCoverFlyCard((current) => current?.card.id === card.id ? null : current), 720);
    }
    setGame(applySevensAction(game, { type: "COVER_CARD", playerId: selfId, cardId: selectedCardId, timestamp: Date.now() }));
    setNotice(card ? `你蓋牌 ${suitMark[card.suit]} ${card.rank}` : "你蓋牌一張");
    setSelectedCardId("");
  }

  function restart() {
    if (roomRef.current) { send("PLAY_AGAIN"); return; }
    setRound((value) => value + 1);
    startGame();
  }

  function send(type: string, extra: Record<string, unknown> = {}) {
    roomRef.current?.send(type, { type, actionId: `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`, ...extra });
  }

  function leaveRoom() {
    if (!roomRef.current) { window.location.href = "/"; return; }
    send("CLOSE_ROOM");
    window.setTimeout(() => { window.location.href = "/"; }, 150);
  }

  const ownLobbyPlayer = lobbyPlayers.find((player) => player.id === selfId);
  const isHost = Boolean(ownLobbyPlayer?.host || (createdAsHost && ownLobbyPlayer?.seat === 0));
  const canUseRoom = status === "connected" && Boolean(roomRef.current);
  const canStart = canUseRoom && isHost && lobbyPlayers.length === playerCount;

  if (screen === "waiting") {
    return <UnifiedWaitingRoom
      gameName="排七"
      roomCode={roomCode}
      round={round}
      status={status}
      statusText={statusText}
      players={lobbyPlayers}
      maxPlayers={playerCount}
      ownId={selfId}
      isHost={isHost}
      canUseRoom={canUseRoom}
      canStart={canStart}
      allowBots
      minPlayers={mode === "classic-four" ? 4 : 5}
      docsHref="/docs/games/sevens.md"
      settings={<SevensSettings mode={mode} />}
      onAddBot={(difficulty) => roomRef.current ? send("ADD_BOT", { difficulty }) : setPlayerCount((value) => Math.min(8, value + 1))}
      onStart={startGame}
      onLeave={leaveRoom}
    />;
  }

  if (!game) return null;

  return (
    <main className="heart-auto-shell sevens-shell">
      <RoomHeader gameName="排七" roomCode={roomCode} round={round} status={status} docsHref="/docs/games/sevens.md" onLeave={leaveRoom} />
      <RoomTable gameName="排七" className="sevens-table">
        <div className="sevens-mode-strip">
          <span>{game.direction === "counterclockwise" ? "逆時針" : "順時針"}</span>
          <span>第 {game.turnNumber} 手</span>
        </div>

        {mode === "double-deck-race" ? <div className="sevens-race-roster" aria-label="競速模式玩家">
          {game.players.map((player) => <span key={player.id} className={player.id === game.currentPlayerId ? "active" : ""}><b>{player.nickname}</b>{game.hands[player.id]?.length ?? 0} 張</span>)}
        </div> : null}

        <section className="sevens-board" aria-label="排七中央牌列">
          {SEVENS_SUITS.map((suit, rowIndex) => (
            <TableauRow
              key={suit}
              suit={suit}
              player={game.players[rowIndex]}
              game={game}
              ownId={selfId}
              selectedCardId={selectedCardId}
              dragState={dragState}
              onDrop={submitPlay}
            />
          ))}
        </section>

        <div className="sevens-turn-banner" role="status">
          <strong>{game.phase === "finished" ? "本局結束" : isMyTurn ? "輪到你了" : `輪到 ${currentPlayer?.nickname ?? "玩家"}`}</strong>
          <span>{notice}</span>
        </div>


        <div className="sevens-covered-pile" aria-label="蓋牌堆">
          <div className="sevens-covered-stack">
            {Array.from({ length: Math.min(ownCoveredCount, 6) }, (_, index) => <span key={index} style={{ transform: `translate(${index * 5}px, ${-index * 4}px) rotate(${index % 2 ? 5 : -3}deg)` }} />)}
            {coverFlyCard ? <span key={coverFlyCard.id} className="sevens-cover-fly"><b>{coverFlyCard.card.rank}</b><i>{suitMark[coverFlyCard.card.suit]}</i></span> : null}
          </div>
          <strong>目前分數 {ownCoveredPoints}</strong>
          <em>蓋牌 {ownCoveredCount} 張</em>
        </div>
        <section className="sevens-hand-zone" aria-label="你的手牌">
          <div className={`sevens-self ${isMyTurn ? "active" : ""}`}><b>南</b><span>你</span><em>剩餘 {ownHand.length} 張</em></div>
          <div className="sevens-hand" role="list">
            {ownHand.map((card) => {
              const legal = isMyTurn && legalIds.has(card.id);
              const coverable = game ? canCoverCard(game, selfId, card.id) : false;
              const selected = selectedCardId === card.id;
              return <button
                key={card.id}
                type="button"
                role="listitem"
                className={`sevens-hand-card ${redSuit(card.suit) ? "red" : ""} ${legal ? "legal" : ""} ${selected ? "selected" : ""} ${dragState.status === "returning" && dragState.cardId === card.id ? "returning" : ""}`}
                draggable={legal}
                aria-label={`${suitLabel[card.suit]} ${card.rank}${legal ? "，可以出牌" : coverable ? "，可以蓋牌" : ""}`}
                aria-pressed={selected}
                onClick={() => (legal || coverable) && setSelectedCardId(card.id)}
                onDragStart={(event) => {
                  if (!legal) { event.preventDefault(); return; }
                  event.dataTransfer.setData("text/plain", card.id);
                  setDragState({ status: "dragging", cardId: card.id, validSlot: getSlotId(card.suit, card.rank) });
                }}
                onDragEnd={() => setDragState((current) => current.status === "submitting" ? current : { status: "idle" })}
              ><span>{card.rank}</span><i>{suitMark[card.suit]}</i><small>{card.rank}</small></button>;
            })}
          </div>
          <button type="button" className="sevens-cover-button" onClick={coverSelected} disabled={!canCover || !selectedCardId || !canCoverCard(game, selfId, selectedCardId)}>
            <Layers3 size={24} />蓋牌
          </button>
        </section>

        {game.phase === "finished" ? <div className="sevens-result" role="dialog" aria-modal="true">
          <span><CheckCircle2 size={30} />本局結束</span>
          <ol>{game.standings?.map((standing) => <li key={standing.playerId}><b>{standing.rank}</b>{standing.nickname}<em>{standing.coveredPoints} 分 / {standing.coveredCount} 張</em></li>)}</ol>
          <button type="button" onClick={restart}><RotateCcw size={20} />再玩一局</button>
        </div> : null}
      </RoomTable>
      <style jsx global>{sevensStyles}</style>
    </main>
  );
}

function createClientGame(state: SevensRoomStateSchema, ownId: string, ownHand: SevensCard[]): SevensState {
  const players = Array.from(state.players) as PublicSevensPlayer[];
  const tableau: SevensState["tableau"] = { spades: {}, hearts: {}, diamonds: {}, clubs: {} };
  Array.from(state.tableauCards).forEach((card) => {
    const suit = card.suit as Suit;
    const rank = card.rank as Rank;
    tableau[suit][rank] = {
      id: card.id,
      suit,
      rank,
      deckIndex: card.deckIndex,
      playerId: card.playerId,
      turnNumber: card.turnNumber
    };
  });
  const hands = Object.fromEntries(players.map((player) => [
    player.id,
    player.id === ownId ? ownHand : placeholderCards(player.id, player.handCount)
  ]));
  const coveredCards = Object.fromEntries(players.map((player) => [
    player.id,
    placeholderCards(`${player.id}-covered`, player.coveredCount)
  ]));
  return {
    phase: state.phase as SevensState["phase"],
    mode: state.mode as SevensMode,
    players: players.map((player) => ({
      id: player.id,
      nickname: player.nickname,
      seat: player.seat,
      type: player.type as "human" | "bot",
      botDifficulty: (player.botDifficulty || undefined) as SevensPlayer["botDifficulty"],
      status: player.status as SevensPlayer["status"]
    })),
    hands,
    tableau,
    coveredCards,
    finishOrder: Array.from(state.standings).sort((left, right) => left.finishOrderIndex - right.finishOrderIndex).map((standing) => standing.playerId),
    currentPlayerId: state.currentPlayerId || null,
    startingPlayerId: state.startingPlayerId,
    direction: state.direction as SevensState["direction"],
    turnNumber: state.turnNumber,
    winnerId: state.winnerId || null,
    standings: state.standings.length ? Array.from(state.standings).map((standing) => ({
      playerId: standing.playerId,
      nickname: standing.nickname,
      rank: standing.rank,
      coveredCount: standing.coveredCount,
      coveredPoints: standing.coveredPoints < 0 ? null : standing.coveredPoints,
      turnOrderIndex: standing.turnOrderIndex,
      finishOrderIndex: standing.finishOrderIndex
    })) : null,
    lastAction: null
  };
}

function placeholderCards(prefix: string, count: number): SevensCard[] {
  return Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index}`, suit: "clubs", rank: "2", deckIndex: 0 }));
}

function SevensSettings({ mode }: { mode: SevensMode }) {
  return <section className="sevens-settings" aria-label="排七規則設定">
    <p>{mode === "classic-four" ? "經典四人排七，逆時針進行。" : "競速模式使用雙副牌，5 至 8 人順時針進行。"}</p>
  </section>;
}

function TableauRow({ suit, player, game, ownId, selectedCardId, dragState, onDrop }: { suit: Suit; player?: SevensPlayer; game: SevensState; ownId: string; selectedCardId: string; dragState: DragState; onDrop: (cardId: string, slotId: string) => void }) {
  const current = player?.id === game.currentPlayerId;
  const selectedCard = game.hands[ownId]?.find((card) => card.id === selectedCardId);
  return <div className="sevens-row">
    <div className={`sevens-player-chip ${current ? "active" : ""}`}><b>{positionName[player?.seat ?? 0]}</b><span>{player?.nickname ?? "玩家"}</span><em>剩餘 {player ? game.hands[player.id]?.length ?? 0 : 0} 張</em></div>
    <strong className={`sevens-suit ${redSuit(suit) ? "red" : ""}`} aria-label={suitLabel[suit]}>{suitMark[suit]}</strong>
    <div className="sevens-slot-track">
      {SEVENS_RANKS.map((rank) => {
        const played = game.tableau[suit][rank];
        const slotId = getSlotId(suit, rank);
        const dragTarget = dragState.status === "dragging" && dragState.validSlot === slotId;
        const keyboardTarget = selectedCard && canPlayCard(game, ownId, selectedCard.id) && selectedCard.suit === suit && selectedCard.rank === rank;
        return <button
          key={rank}
          type="button"
          className={`sevens-slot ${played ? "filled" : ""} ${redSuit(suit) ? "red" : ""} ${dragTarget || keyboardTarget ? "target" : ""}`}
          aria-label={`${suitLabel[suit]} ${rank}${played ? "，已出牌" : dragTarget || keyboardTarget ? "，可放到這裡" : "，空位"}`}
          onClick={() => keyboardTarget && onDrop(selectedCard.id, slotId)}
          onDragOver={(event) => { if (dragTarget) event.preventDefault(); }}
          onDrop={(event) => { event.preventDefault(); onDrop(event.dataTransfer.getData("text/plain"), slotId); }}
        >{played ? <><span>{rank}</span><i>{suitMark[suit]}</i></> : <span>{rank}</span>}</button>;
      })}
    </div>
  </div>;
}

function createLobbyPlayers(count: number, ownId: string): RoomPlayer[] {
  return Array.from({ length: count }, (_, seat) => seat === 0
    ? { id: ownId, seat, nickname: "你", host: true, ready: true, connected: true, type: "human" }
    : { id: `bot-${seat}`, seat, nickname: getBotPlayerNameForDifficulty(seat, "normal"), ready: true, connected: true, type: "bot", botDifficulty: "normal" });
}

function redSuit(suit: Suit) { return suit === "hearts" || suit === "diamonds"; }

function parseDifficulty(value: string | null): "easy" | "normal" | "hard" {
  if (value === "簡單" || value === "easy") return "easy";
  if (value === "困難" || value === "hard") return "hard";
  return "normal";
}

function getTabClientId(scope: string) {
  const key = `poker-${scope}-client-id`;
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const next = crypto.randomUUID();
  window.sessionStorage.setItem(key, next);
  return next;
}

function errorLabel(value: string) {
  return ({
    ROOM_LOCKED: "房間已開始，不能加入。",
    ROOM_FULL: "房間已滿。",
    ALL_SEATS_REQUIRED: "座位尚未補滿。",
    ALL_PLAYERS_MUST_BE_READY: "所有真人玩家都要準備。",
    HOST_ONLY: "只有房主可以操作。",
    TOO_MANY_PLAYERS: "目前玩家數超過設定人數。",
    "Illegal sevens play.": "這張牌現在不能出。",
    "Illegal sevens cover.": "這張牌現在不能蓋。"
  } as Record<string, string>)[value] ?? value;
}

const sevensStyles = `
.room-waiting-settings{grid-column:1/-1}.sevens-settings{display:flex;align-items:center;gap:16px;flex-wrap:wrap;background:#fffaf0;border:4px solid #111;padding:14px;box-shadow:7px 7px 0 #111}.sevens-segments{display:flex;border:3px solid #111}.sevens-segments button{border:0;border-right:3px solid #111;padding:12px 18px;font-weight:900;background:#fff}.sevens-segments button:last-child{border-right:0}.sevens-segments button.active{background:#ffda4f}.sevens-settings label{font-weight:900}.sevens-settings input{width:70px;border:3px solid #111;padding:8px;font:inherit}.sevens-settings p{margin:0;font-weight:800}.sevens-table{min-height:820px!important;padding:26px 24px 230px!important;overflow:hidden}.sevens-mode-strip{display:flex;justify-content:center;gap:10px;flex-wrap:wrap}.sevens-mode-strip>*{background:#fffaf0;border:3px solid #111;padding:8px 14px;box-shadow:4px 4px 0 #111}.sevens-mode-strip strong{background:#ffda4f}.sevens-race-roster{display:flex;gap:7px;justify-content:center;overflow-x:auto;margin:12px auto 0;padding:4px}.sevens-race-roster span{display:flex;gap:7px;white-space:nowrap;background:#fffaf0;border:3px solid #111;padding:6px 9px;font-weight:800}.sevens-race-roster span.active{background:#ffda4f}.sevens-board{width:min(1450px,100%);margin:24px auto 0;display:grid;gap:10px}.sevens-row{display:grid;grid-template-columns:210px 48px minmax(0,1fr);align-items:center;gap:12px}.sevens-player-chip{display:grid;grid-template-columns:54px 1fr;background:#fffaf0;border:4px solid #111;box-shadow:5px 5px 0 #111;min-height:70px;padding:6px}.sevens-player-chip.active{outline:5px solid #ffda4f}.sevens-player-chip b{grid-row:1/3;display:grid;place-items:center;border:3px solid #111;border-radius:50%;background:#fff;font-size:1.5rem}.sevens-player-chip span,.sevens-player-chip em{padding-left:8px;font-style:normal;font-weight:900}.sevens-player-chip em{font-size:.85rem}.sevens-suit{font-size:2.5rem;text-align:center}.sevens-suit.red,.sevens-slot.red,.sevens-hand-card.red{color:#d54032}.sevens-slot-track{display:grid;grid-template-columns:repeat(13,minmax(55px,1fr));gap:5px;min-width:780px}.sevens-slot{height:88px;border:3px dashed rgba(255,255,255,.55);background:rgba(10,46,139,.22);color:rgba(255,255,255,.58);font-size:1.2rem;font-weight:900}.sevens-slot.filled{display:flex;flex-direction:column;justify-content:space-between;align-items:flex-start;background:#fffaf0;color:#111;border:3px solid #111;box-shadow:4px 4px 0 #111;padding:7px}.sevens-slot.filled.red{color:#d54032}.sevens-slot.target{border:4px dashed #ffda4f;box-shadow:0 0 0 4px rgba(255,218,79,.3),0 0 18px #ffda4f;color:#ffda4f}.sevens-turn-banner{position:absolute;left:50%;bottom:204px;transform:translateX(-50%);display:flex;align-items:center;gap:14px;background:#111;color:#fff;padding:12px 20px;border:3px solid #111;box-shadow:6px 6px 0 rgba(0,0,0,.3);z-index:5}.sevens-turn-banner strong{color:#ffda4f;font-size:1.25rem}.sevens-hand-zone{position:absolute;left:16px;right:16px;bottom:16px;display:grid;grid-template-columns:150px minmax(0,1fr) 130px;align-items:end;gap:12px}.sevens-self{background:#fffaf0;border:4px solid #111;box-shadow:5px 5px 0 #111;padding:10px;display:grid;grid-template-columns:46px 1fr}.sevens-self.active{outline:5px solid #ffda4f}.sevens-self b{grid-row:1/3;display:grid;place-items:center;border-radius:50%;background:#ffda4f;border:3px solid #111;font-size:1.4rem}.sevens-self span,.sevens-self em{padding-left:8px;font-style:normal;font-weight:900}.sevens-hand{display:flex;align-items:flex-end;overflow-x:auto;overflow-y:hidden;min-height:164px;padding:18px 8px 9px;scrollbar-color:#ffda4f #111}.sevens-hand-card{position:relative;flex:0 0 88px;width:88px;height:142px;margin-left:-12px;background:#fffaf0;border:4px solid #111;color:#111;box-shadow:5px 6px 0 rgba(0,0,0,.35);font-weight:900;transition:transform .16s ease,border-color .16s ease}.sevens-hand-card:first-child{margin-left:0}.sevens-hand-card span{position:absolute;top:8px;left:9px;font-size:1.55rem}.sevens-hand-card i{position:absolute;top:40px;left:11px;font-size:1.5rem;font-style:normal}.sevens-hand-card small{position:absolute;right:8px;bottom:4px;font-size:2.4rem;opacity:.12}.sevens-hand-card.legal{cursor:grab}.sevens-hand-card.legal:hover,.sevens-hand-card.selected{transform:translateY(-15px);border-color:#ffda4f;box-shadow:0 0 0 4px #111,0 0 20px #ffda4f}.sevens-hand-card.returning{animation:sevens-return .26s ease}.sevens-cover-button{min-height:76px;background:#ef5f54;border:4px solid #111;box-shadow:6px 6px 0 #111;color:#fff;font-weight:900;font-size:1.35rem}.sevens-cover-button:disabled{background:#b9b5aa;color:#716d65}.sevens-result{position:absolute;inset:50% auto auto 50%;transform:translate(-50%,-50%);z-index:20;width:min(440px,calc(100% - 32px));background:#fffaf0;border:5px solid #111;box-shadow:12px 12px 0 #111;padding:22px}.sevens-result>span{display:flex;align-items:center;gap:8px;font-size:1.7rem;font-weight:900}.sevens-result ol{padding:0;list-style:none}.sevens-result li{display:grid;grid-template-columns:38px 1fr auto;border-top:2px solid #111;padding:9px;font-weight:900}.sevens-result li em{font-style:normal}.sevens-result button{width:100%;padding:13px;background:#ffda4f;border:3px solid #111;font-weight:900}.sevens-result button svg,.sevens-cover-button svg{vertical-align:middle;margin-right:6px}@keyframes sevens-return{50%{transform:translateY(-20px) rotate(-3deg)}}@media(prefers-reduced-motion:reduce){.sevens-hand-card{transition:none}.sevens-hand-card.returning{animation:none}}@media(max-width:900px){.sevens-table{padding-inline:12px!important}.sevens-board{overflow-x:auto;padding-bottom:8px}.sevens-row{grid-template-columns:150px 38px minmax(780px,1fr)}.sevens-player-chip{min-width:150px}.sevens-hand-zone{grid-template-columns:110px minmax(0,1fr) 100px}.sevens-turn-banner{bottom:205px;white-space:nowrap}.sevens-hand-card{flex-basis:76px;width:76px;height:126px}.sevens-cover-button{font-size:1rem}}@media(max-width:600px){.sevens-table{min-height:790px!important;padding-bottom:212px!important}.sevens-mode-strip{justify-content:flex-start;overflow-x:auto;flex-wrap:nowrap}.sevens-mode-strip>*{white-space:nowrap}.sevens-board{margin-top:14px}.sevens-row{grid-template-columns:112px 30px minmax(730px,1fr)}.sevens-player-chip{min-width:112px;grid-template-columns:38px 1fr;min-height:60px;padding:4px}.sevens-player-chip b{font-size:1rem}.sevens-player-chip span{font-size:.82rem}.sevens-player-chip em{font-size:.67rem}.sevens-slot-track{min-width:730px}.sevens-slot{height:76px}.sevens-turn-banner{left:12px;right:12px;bottom:184px;transform:none;justify-content:center;padding:9px}.sevens-turn-banner span{display:none}.sevens-hand-zone{left:8px;right:8px;bottom:8px;grid-template-columns:82px minmax(0,1fr) 84px;gap:5px}.sevens-self{padding:5px;grid-template-columns:32px 1fr}.sevens-self b{font-size:1rem}.sevens-self span{font-size:.8rem}.sevens-self em{font-size:.62rem}.sevens-hand{min-height:145px}.sevens-hand-card{flex-basis:68px;width:68px;height:116px;margin-left:-9px}.sevens-cover-button{min-height:64px;padding:4px}.sevens-cover-button svg{display:block;margin:0 auto 2px}}
.sevens-covered-pile{position:absolute;right:8%;bottom:102px;z-index:6;width:168px;min-height:138px;display:grid;justify-items:center;align-content:center;gap:6px;background:#ffda4f;border:5px solid #111;box-shadow:8px 8px 0 rgba(0,0,0,.35);border-radius:16px;color:#111;font-weight:900}.sevens-covered-stack{position:relative;width:76px;height:96px}.sevens-covered-stack span{position:absolute;left:8px;bottom:8px;width:56px;height:82px;border:3px solid #111;border-radius:7px;background:repeating-linear-gradient(45deg,#255cf0 0 7px,#ffffff 7px 11px);box-shadow:3px 4px 0 rgba(0,0,0,.25)}.sevens-covered-stack .sevens-cover-fly{animation:sevens-cover-to-pile .68s cubic-bezier(.2,.8,.2,1) both;background:#fffaf0;color:#111;display:block}.sevens-covered-stack .sevens-cover-fly b{position:absolute;left:7px;top:5px;font-size:1.25rem}.sevens-covered-stack .sevens-cover-fly i{position:absolute;left:8px;top:29px;font-size:1.25rem;font-style:normal}.sevens-covered-pile strong,.sevens-covered-pile em{font-style:normal;background:#fffaf0;border:3px solid #111;padding:4px 8px}.sevens-covered-pile em{font-size:.9rem}@keyframes sevens-cover-to-pile{0%{opacity:.9;transform:translate(-46vw,22vh) rotate(-10deg) scale(1.25)}70%{opacity:1;transform:translate(0,-8px) rotate(4deg) scale(1.05)}100%{opacity:1;transform:translate(0,0) rotate(-3deg) scale(1)}}@media(max-width:900px){.sevens-covered-pile{right:18px;bottom:96px;width:138px;min-height:122px}.sevens-covered-stack{width:60px;height:80px}.sevens-covered-stack span{width:46px;height:66px}}@media(max-width:600px){.sevens-covered-pile{right:8px;bottom:92px;width:118px;min-height:104px;border-width:4px}.sevens-covered-pile strong,.sevens-covered-pile em{font-size:.75rem}.sevens-covered-stack{width:52px;height:66px}.sevens-covered-stack span{width:40px;height:56px}}`;
