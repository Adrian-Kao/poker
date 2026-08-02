import type { Card, Rank } from "../core/cards";
import { PICK_RED_MAX_PLAYERS, PICK_RED_MIN_PLAYERS, TARGET_SELECTION_MS } from "./constants";
import { createPickRedPointsDeck } from "./deck";
import { calculatePickRedCardScore, calculatePickRedPlayerScore } from "./scoring";
import type { CreatePickRedPointsPlayerInput, PickRedPointsPlayer, PickRedPointsState, TableCard, VisiblePickRedPointsState } from "./types";

export function createPickRedPointsGame(options: { players: CreatePickRedPointsPlayerInput[]; random?: () => number }): PickRedPointsState {
  if (options.players.length < PICK_RED_MIN_PLAYERS || options.players.length > PICK_RED_MAX_PLAYERS) throw new Error("Pick red points needs 2 to 4 players.");
  if (new Set(options.players.map((player) => player.id)).size !== options.players.length) throw new Error("Player ids must be unique.");
  const deck = createPickRedPointsDeck(options.random);
  const hands: Record<string, Card[]> = Object.fromEntries(options.players.map((player) => [player.id, []]));
  for (let index = 0; index < 24; index += 1) hands[options.players[index % options.players.length].id].push(deck[index]);
  const tableCards = deck.slice(24, 28).map((card, index) => ({ card, enteredAtTurn: 0, tableOrder: index }));
  const players: PickRedPointsPlayer[] = options.players.map((player, seat) => ({ id: player.id, nickname: player.nickname, seat, type: player.type ?? "human", botDifficulty: player.botDifficulty, status: "playing", connected: player.connected ?? true }));
  return {
    phase: "playing-hand", players, hands, tableCards, drawPile: deck.slice(28),
    capturedCards: Object.fromEntries(players.map((player) => [player.id, []])), currentPlayerId: players[0].id,
    pendingCard: null, legalTargetIds: [], targetDeadline: null, scores: Object.fromEntries(players.map((player) => [player.id, 0])),
    startingPlayerId: players[0].id, roundNumber: 1, turnNumber: 1, winners: [], processedActionIds: [], lastResult: "輪到你了，請選一張手牌"
  };
}

export function getPickRedDealCount(playerCount: number) { if (![2, 3, 4].includes(playerCount)) throw new Error("Player count must be 2, 3 or 4."); return 24 / playerCount; }
export function getMatchingTableCards(card: Card, tableCards: TableCard[]) { return tableCards.filter((tableCard) => isValidPickRedPair(card, tableCard.card)); }
export function isValidPickRedPair(played: Card, table: Card): boolean {
  const faces: Rank[] = ["10", "J", "Q", "K"];
  if (faces.includes(played.rank) || faces.includes(table.rank)) return played.rank === table.rank;
  const value = (rank: Rank) => rank === "A" ? 1 : Number(rank);
  return value(played.rank) + value(table.rank) === 10;
}

export function playPickRedHandCard(state: PickRedPointsState, playerId: string, cardId: string, now = Date.now(), actionId = `play-${now}`): PickRedPointsState {
  assertAction(state, actionId);
  if (state.phase !== "playing-hand") throw new Error("INVALID_PHASE");
  if (state.currentPlayerId !== playerId) throw new Error("NOT_YOUR_TURN");
  const card = state.hands[playerId]?.find((item) => item.id === cardId);
  if (!card) throw new Error("CARD_NOT_IN_HAND");
  const legalTargets = getMatchingTableCards(card, state.tableCards);
  const next = markAction({ ...state, hands: { ...state.hands, [playerId]: state.hands[playerId].filter((item) => item.id !== cardId) }, pendingCard: { card, source: "hand", ownerPlayerId: playerId }, legalTargetIds: legalTargets.map((item) => item.card.id), targetDeadline: legalTargets.length ? now + TARGET_SELECTION_MS : null, phase: legalTargets.length ? "selecting-hand-target" : "drawing", lastResult: legalTargets.length ? "請選擇一張桌牌配對" : `${card.rank} 沒有可配對的牌，將留在桌上` }, actionId);
  return legalTargets.length ? next : drawPickRedCard(placePickRedCardOnTable(next, playerId), playerId, now);
}

export function selectPickRedCaptureTarget(state: PickRedPointsState, playerId: string, targetCardId: string, pendingSource: "hand" | "draw", now = Date.now(), actionId = `target-${now}`): PickRedPointsState {
  assertAction(state, actionId);
  if (state.currentPlayerId !== playerId) throw new Error("NOT_YOUR_TURN");
  if (!state.pendingCard || state.pendingCard.ownerPlayerId !== playerId || state.pendingCard.source !== pendingSource) throw new Error("TARGET_SELECTION_REQUIRED");
  if (!state.legalTargetIds.includes(targetCardId)) throw new Error("INVALID_CAPTURE_PAIR");
  return capturePickRedPair(markAction(state, actionId), playerId, targetCardId, now);
}

export function drawPickRedCard(state: PickRedPointsState, playerId: string, now = Date.now()): PickRedPointsState {
  if (state.phase !== "drawing") throw new Error("INVALID_PHASE");
  if (state.currentPlayerId !== playerId) throw new Error("NOT_YOUR_TURN");
  const card = state.drawPile[0];
  if (!card) return finishPickRedTurn({ ...state, phase: "turn-result", pendingCard: null }, "抽牌堆已空");
  const next = { ...state, drawPile: state.drawPile.slice(1), turnNumber: state.turnNumber + 1 };
  const legalTargets = getMatchingTableCards(card, next.tableCards);
  if (!legalTargets.length) return finishPickRedTurn(placePickRedCardOnTable({ ...next, pendingCard: { card, source: "draw", ownerPlayerId: playerId } }, playerId), "翻牌沒有配對，牌留在桌上");
  if (legalTargets.length === 1) return finishPickRedTurn(capturePickRedPair({ ...next, pendingCard: { card, source: "draw", ownerPlayerId: playerId }, legalTargetIds: [legalTargets[0].card.id] }, playerId, legalTargets[0].card.id, now), "翻牌完成配對");
  return { ...next, phase: "selecting-draw-target", pendingCard: { card, source: "draw", ownerPlayerId: playerId }, legalTargetIds: legalTargets.map((item) => item.card.id), targetDeadline: now + TARGET_SELECTION_MS, lastResult: "翻出的牌有多個配對，請選擇桌牌" };
}

export function capturePickRedPair(state: PickRedPointsState, playerId: string, targetCardId: string, now = Date.now()): PickRedPointsState {
  const pending = state.pendingCard;
  if (!pending || pending.ownerPlayerId !== playerId) throw new Error("TARGET_SELECTION_REQUIRED");
  const target = state.tableCards.find((item) => item.card.id === targetCardId);
  if (!target || !isValidPickRedPair(pending.card, target.card)) throw new Error("INVALID_CAPTURE_PAIR");
  const capturedCards = { ...state.capturedCards, [playerId]: [...state.capturedCards[playerId], pending.card, target.card] };
  const next = { ...state, phase: pending.source === "hand" ? "drawing" as const : "turn-result" as const, tableCards: state.tableCards.filter((item) => item.card.id !== targetCardId), capturedCards, scores: { ...state.scores, [playerId]: calculatePickRedPlayerScore(capturedCards[playerId]) }, pendingCard: null, legalTargetIds: [], targetDeadline: null, lastResult: `撿到${pending.card.rank}與${target.card.rank}，+${calculatePickRedCardScore(pending.card) + calculatePickRedCardScore(target.card)}分` };
  return pending.source === "hand" ? drawPickRedCard(next, playerId, now) : finishPickRedTurn(next);
}

export function placePickRedCardOnTable(state: PickRedPointsState, playerId: string): PickRedPointsState {
  const pending = state.pendingCard;
  if (!pending || pending.ownerPlayerId !== playerId) throw new Error("TARGET_SELECTION_REQUIRED");
  const tableCard: TableCard = { card: pending.card, enteredAtTurn: state.turnNumber, tableOrder: state.tableCards.length ? Math.max(...state.tableCards.map((item) => item.tableOrder)) + 1 : 0 };
  return { ...state, phase: "drawing", tableCards: [...state.tableCards, tableCard], pendingCard: null, legalTargetIds: [], targetDeadline: null, lastResult: "牌已放到桌面" };
}

export function resolvePickRedTargetTimeout(state: PickRedPointsState, now = Date.now()): PickRedPointsState {
  if (!state.pendingCard || !state.targetDeadline || now < state.targetDeadline) return state;
  const target = state.tableCards.filter((item) => state.legalTargetIds.includes(item.card.id)).sort((left, right) => calculatePickRedCardScore(right.card) - calculatePickRedCardScore(left.card) || left.tableOrder - right.tableOrder)[0];
  if (!target) throw new Error("TARGET_SELECTION_REQUIRED");
  return capturePickRedPair(state, state.pendingCard.ownerPlayerId, target.card.id, now);
}

export function getNextPickRedPlayer(state: PickRedPointsState, playerId = state.currentPlayerId): string | null { if (!playerId) return null; const index = state.players.findIndex((player) => player.id === playerId); return index < 0 ? null : state.players[(index + 1) % state.players.length]?.id ?? null; }
export function isPickRedGameFinished(state: PickRedPointsState) { return Object.values(state.hands).every((hand) => hand.length === 0) && state.drawPile.length === 0 && !state.pendingCard && !["selecting-hand-target", "selecting-draw-target"].includes(state.phase); }
export function getPickRedWinners(state: PickRedPointsState): string[] {
  const entries = state.players.map((player) => ({ id: player.id, score: state.scores[player.id] ?? 0, red: (state.capturedCards[player.id] ?? []).filter((card) => card.suit === "hearts" || card.suit === "diamonds").length, captured: state.capturedCards[player.id]?.length ?? 0 }));
  const score = Math.max(...entries.map((entry) => entry.score)); const scoreLeaders = entries.filter((entry) => entry.score === score); const red = Math.max(...scoreLeaders.map((entry) => entry.red)); const redLeaders = scoreLeaders.filter((entry) => entry.red === red); const captured = Math.max(...redLeaders.map((entry) => entry.captured));
  return redLeaders.filter((entry) => entry.captured === captured).map((entry) => entry.id);
}
export function getVisiblePickRedState(state: PickRedPointsState): VisiblePickRedPointsState {
  const { hands, drawPile, processedActionIds: _processed, ...publicState } = state;
  return { ...publicState, handCounts: Object.fromEntries(Object.entries(hands).map(([id, hand]) => [id, hand.length])), drawPileCount: drawPile.length };
}

function finishPickRedTurn(state: PickRedPointsState, result?: string): PickRedPointsState { if (isPickRedGameFinished(state)) { const winners = getPickRedWinners(state); return { ...state, phase: "finished", currentPlayerId: null, winners, lastResult: result ?? "本局結束" }; } return { ...state, phase: "playing-hand", currentPlayerId: getNextPickRedPlayer(state), roundNumber: state.roundNumber + 1, lastResult: result ?? state.lastResult }; }
function assertAction(state: PickRedPointsState, actionId: string) { if (!actionId) throw new Error("Missing actionId."); if (state.processedActionIds.includes(actionId)) throw new Error("ACTION_ALREADY_PROCESSED"); }
function markAction(state: PickRedPointsState, actionId: string): PickRedPointsState { return { ...state, processedActionIds: [...state.processedActionIds, actionId] }; }
