"use client";

import { Check, Clock3, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Client, type Room } from "colyseus.js";
import type { Card, Suit } from "../../../lib/games/core/cards";
import { classifyCombination, compareCombinations, sortBigTwoCards } from "../../../lib/games/big-two";
import type { BigTwoServerEvent } from "../../../server/messages/bigTwoMessages";
import { BigTwoRoomStateSchema, type PublicBigTwoPlayer } from "../../../server/schema/BigTwoRoomState";
import { useBgmMode } from "../../SoundProvider";
import { RoomHeader, RoomOpponentSeat, RoomSelfBadge, RoomTable, UnifiedWaitingRoom, type RoomSeatPosition } from "../room";

type ConnectionStatus = "connecting" | "connected" | "error" | "closed";
const gameServerUrl = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "ws://localhost:2567";
const suitMarks: Record<Suit, string> = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" };

export default function BigTwoPage() {
  const [roomCode, setRoomCode] = useState("------");
  const [nickname, setNickname] = useState("玩家");
  const [ownId, setOwnId] = useState("");
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [statusText, setStatusText] = useState("正在連接大老二房間...");
  const [state, setState] = useState<BigTwoRoomStateSchema | null>(null);
  const [stateVersion, setStateVersion] = useState(0);
  const [hand, setHand] = useState<Card[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const roomRef = useRef<Room<BigTwoRoomStateSchema> | null>(null);

  useEffect(() => {
    let disposed = false;
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode") === "join" ? "join" : "create";
    const requestedRoom = (params.get("room") ?? "").replace(/\D/g, "").slice(0, 6);
    const name = params.get("name")?.trim() || params.get("nickname")?.trim() || "玩家";
    const maxPlayers = Number(params.get("players") ?? 4) === 3 ? 3 : 4;
    const bots = Number(params.get("bots") ?? 0);
    const difficulty = parseDifficulty(params.get("difficulty"));
    const clientId = getTabClientId("big-two");
    const client = new Client(gameServerUrl);
    setNickname(name);

    async function connect() {
      try {
        const room = mode === "join"
          ? await client.join<BigTwoRoomStateSchema>("big_two", { nickname: name, roomCode: requestedRoom, clientId }, BigTwoRoomStateSchema)
          : await client.create<BigTwoRoomStateSchema>("big_two", { nickname: name, maxPlayers, bots, difficulty, clientId }, BigTwoRoomStateSchema);
        if (disposed) { await room.leave(); return; }
        roomRef.current = room;
        setOwnId(`player-${room.sessionId}`);
        setStatus("connected");
        setStatusText(mode === "join" ? "已加入大老二等待室，請切換準備狀態。" : "大老二房間已建立，分享房號邀請朋友。");
        setState(room.state);
        setRoomCode(room.state.roomCode || room.roomId.slice(0, 6));
        setStateVersion((value) => value + 1);
        room.onStateChange((next) => { setState(next); setRoomCode(next.roomCode || room.roomId.slice(0, 6)); setStateVersion((value) => value + 1); });
        room.onMessage<BigTwoServerEvent>("big-two:event", (event) => {
          if (event.type === "PRIVATE_HAND") { setHand(sortBigTwoCards(event.cards)); setSelectedIds((current) => current.filter((id) => event.cards.some((card) => card.id === id))); }
          if (event.type === "ACTION_REJECTED") setStatusText(errorLabel(event.reason));
          if (event.type === "ROOM_CLOSED") window.location.href = "/";
        });
        room.onError((_code, message) => { setStatus("error"); setStatusText(message ?? "連線發生錯誤"); });
        room.onLeave(() => { if (!disposed) setStatus("closed"); });
      } catch (error) {
        setStatus("error");
        setStatusText(error instanceof Error ? error.message : "無法建立或加入大老二房間");
      }
    }
    connect();
    return () => { disposed = true; roomRef.current?.leave(); roomRef.current = null; };
  }, []);

  const players = useMemo(() => Array.from(state?.players ?? []) as PublicBigTwoPlayer[], [state, stateVersion]);
  const own = players.find((player) => player.id === ownId);
  const selectedCards = useMemo(() => hand.filter((card) => selectedIds.includes(card.id)), [hand, selectedIds]);
  const combination = classifyCombination(selectedCards);
  const previousCombination = state?.lastCombination && state.lastCards.length ? classifyCombination(Array.from(state.lastCards).map(toCard)) : null;
  const isMyTurn = state?.phase === "playing" && state.currentPlayerId === ownId;
  const canPlay = isMyTurn && !!combination && (!previousCombination || compareCombinations(combination, previousCombination) > 0) && (!state?.firstTurnPending || selectedIds.includes("clubs-3"));
  const canPass = isMyTurn && state?.lastCards.length !== 0;
  const isHost = own?.host ?? false;
  const maxPlayers = state?.maxPlayers ?? 4;
  const canUseRoom = status === "connected" && !!roomRef.current;
  const canStart = canUseRoom && isHost && players.length === maxPlayers && players.every((player) => player.ready);
  const seconds = useCountdown(state?.turnDeadline ?? 0, stateVersion);
  useBgmMode(!state || state.phase === "waiting" ? "lobby" : "playing");

  function send(type: string, extra: Record<string, unknown> = {}) { roomRef.current?.send(type, { type, actionId: `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`, ...extra }); }
  function leaveRoom() { if (!roomRef.current) { window.location.href = "/"; return; } send("CLOSE_ROOM"); window.setTimeout(() => { window.location.href = "/"; }, 150); }
  function toggleCard(id: string) { if (!isMyTurn) return; setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : current.length < 5 ? [...current, id] : current); }
  function play() { if (!canPlay) return; send("PLAY_CARDS", { cardIds: selectedIds }); }
  function pass() { if (!canPass) return; send("PASS"); setSelectedIds([]); }

  if (!state || state.phase === "waiting") return <UnifiedWaitingRoom gameName="大老二" roomCode={roomCode} round={state?.round ?? 1} status={status} statusText={statusText} players={players.map((player) => ({ id: player.id, seat: player.seat, nickname: player.nickname, host: player.host, ready: player.ready, type: player.type }))} maxPlayers={maxPlayers} ownId={ownId} isHost={isHost} canUseRoom={canUseRoom} canStart={canStart} allowBots minPlayers={maxPlayers} docsHref="/docs/games/big-two.md" onReady={() => send("SET_READY", { ready: !own?.ready })} onAddBot={() => send("ADD_BOT", { difficulty: "normal" })} onStart={() => send("START_GAME")} onLeave={leaveRoom} />;

  const opponents = mapOpponents(players, ownId);
  const currentName = players.find((player) => player.id === state.currentPlayerId)?.nickname ?? "玩家";
  return (
    <main className="bluff-page-shell big-two-shell">
      <RoomHeader gameName="大老二" roomCode={roomCode} round={state.round} status={status} docsHref="/docs/games/big-two.md" onLeave={leaveRoom} />
      <RoomTable gameName="大老二" className="big-two-table shared-big-two-table">
        {opponents.map((player) => <RoomOpponentSeat key={player.id} player={player} position={player.position} active={player.id === state.currentPlayerId} passed={player.passed} />)}
        <div className="big-two-center shared-big-two-center">
          <div className="big-two-turn-row"><span className="big-two-countdown"><Clock3 size={22} />{seconds} 秒</span><strong>{isMyTurn ? "輪到你了" : `等待 ${currentName} 出牌`}</strong></div>
          <div className="big-two-previous-panel"><h2>{state.notice}</h2><div className="big-two-previous-cards">{Array.from(state.lastCards).map((card) => <BigTwoCard key={card.id} card={toCard(card)} compact />)}</div><p>{state.lastCombination ? combinationLabel(state.lastCombination) : "你可以自由出牌"}</p></div>
        </div>
        <section className="bluff-self-zone big-two-self-zone" aria-label="自己的手牌">
          <RoomSelfBadge nickname={nickname} active={isMyTurn} count={hand.length} />
          <div className="big-two-hand">{hand.map((card) => <button type="button" key={card.id} className={`big-two-card-button ${selectedIds.includes(card.id) ? "selected" : ""}`} onClick={() => toggleCard(card.id)} aria-pressed={selectedIds.includes(card.id)} aria-label={`${card.rank}${suitMarks[card.suit]}${selectedIds.includes(card.id) ? "，已選取" : ""}`}><BigTwoCard card={card} /></button>)}</div>
        </section>
      </RoomTable>
      <section className="bluff-bottom-controls big-two-shared-controls">
        <div className={`big-two-combination ${canPlay ? "legal" : ""}`} aria-live="polite"><strong>{selectionMessage(selectedCards, combination, state.firstTurnPending, previousCombination)}</strong></div>
        <button type="button" className="big-two-play-button" onClick={play} disabled={!canPlay}><Play size={26} />出牌</button>
        <button type="button" className="big-two-pass-button" onClick={pass} disabled={!canPass}><Check size={26} />PASS</button>
      </section>
      {state.phase === "finished" ? <div className="ninety-result-banner"><strong>{state.notice}</strong>{isHost ? <button type="button" onClick={() => send("PLAY_AGAIN")}>再來一局</button> : null}</div> : null}
    </main>
  );
}

function BigTwoCard({ card, compact = false }: { card: Card; compact?: boolean }) { const red = card.suit === "diamonds" || card.suit === "hearts"; return <span className={`big-two-card card-face ${compact ? "compact" : ""} ${red ? "red" : "black"}`}><span>{card.rank}</span><em>{suitMarks[card.suit]}</em>{!compact ? <strong>{card.rank}</strong> : null}</span>; }
function toCard(card: { id: string; rank: string; suit: string }): Card { return { id: card.id, rank: card.rank as Card["rank"], suit: card.suit as Card["suit"] }; }
function mapOpponents(players: PublicBigTwoPlayer[], ownId: string) { const others = players.filter((player) => player.id !== ownId); const positions: RoomSeatPosition[] = players.length === 3 ? ["left", "right"] : ["top", "left", "right"]; return others.map((player, index) => ({ id: player.id, nickname: player.nickname, type: player.type, connected: player.connected, cardsRemaining: player.cardsRemaining, status: player.status, passed: player.passed, position: positions[index] ?? "top" })); }
function combinationLabel(value: string) { return ({ single: "單張", pair: "對子", straight: "順子", "full-house": "葫蘆", "four-of-a-kind": "鐵支", "straight-flush": "同花順" } as Record<string, string>)[value] ?? value; }
function selectionMessage(cards: Card[], combination: ReturnType<typeof classifyCombination>, first: boolean, previous: ReturnType<typeof classifyCombination>) { if (!cards.length) return "選擇 1、2 或 5 張牌"; if (!combination) return cards.length === 3 || cards.length === 4 ? "本平台不使用三條；鐵支必須帶一張牌" : "非法組合"; if (first && !cards.some((card) => card.id === "clubs-3")) return "第一手必須包含梅花 3"; if (previous) { const compared = compareCombinations(combination, previous); if (compared === Number.NEGATIVE_INFINITY) return "只能出相同牌型；鐵支或同花順可以切牌"; if (compared <= 0) return "牌型正確，但不夠大"; } return `${combinationLabel(combination.type)}${combination.isBomb ? "，可切牌" : ""}`; }
function errorLabel(value: string) { return ({ NOT_YOUR_TURN: "還沒輪到你", MUST_INCLUDE_THREE_OF_CLUBS: "第一手必須包含梅花 3", CANNOT_PASS_ON_LEAD: "新墩不能 PASS", INVALID_COMBINATION: "不是合法牌型", PLAY_NOT_HIGH_ENOUGH: "牌型正確，但不夠大", MUST_MATCH_CARD_COUNT: "只能出相同牌型；鐵支或同花順可以切牌" } as Record<string, string>)[value] ?? value; }
function parseDifficulty(value: string | null) { if (value === "簡單" || value === "easy") return "easy"; if (value === "困難" || value === "hard") return "hard"; return "normal"; }
function getTabClientId(scope: string) { const key = `poker-${scope}-client-id`; const existing = window.sessionStorage.getItem(key); if (existing) return existing; const next = crypto.randomUUID(); window.sessionStorage.setItem(key, next); return next; }
function useCountdown(deadline: number, version: number) { const [seconds, setSeconds] = useState(0); useEffect(() => { const update = () => setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))); update(); const timer = window.setInterval(update, 250); return () => window.clearInterval(timer); }, [deadline, version]); return seconds; }
