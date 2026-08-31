import type { Card, Rank } from "../core/cards";
import { PICK_RED_MAX_PLAYERS, PICK_RED_MIN_PLAYERS, TARGET_SELECTION_MS } from "./constants";
import { createPickRedPointsDeck } from "./deck";
import { calculatePickRedCardScore, calculatePickRedScores, finalizePickRedScores, getPickRedWinningScore } from "./scoring";
import type { CreatePickRedPointsPlayerInput, PickRedPointsPlayer, PickRedPointsState, TableCard, VisiblePickRedPointsState } from "./types";

/** 建立新牌局、發出手牌與桌牌，並在正式開局前檢查全黑手牌資格。 */
export function createPickRedPointsGame(options: { players: CreatePickRedPointsPlayerInput[]; random?: () => number }): PickRedPointsState {
  if (options.players.length < PICK_RED_MIN_PLAYERS || options.players.length > PICK_RED_MAX_PLAYERS) throw new Error("Pick red points needs 2 to 4 players.");
  if (new Set(options.players.map((player) => player.id)).size !== options.players.length) throw new Error("Player ids must be unique.");
  const deck = createPickRedPointsDeck(options.random);
  const hands: Record<string, Card[]> = Object.fromEntries(options.players.map((player) => [player.id, []]));
  for (let index = 0; index < 24; index += 1) hands[options.players[index % options.players.length].id].push(deck[index]);
  const tableCards = deck.slice(24, 28).map((card, index) => ({ card, enteredAtTurn: 0, tableOrder: index }));
  const players: PickRedPointsPlayer[] = options.players.map((player, seat) => ({ id: player.id, nickname: player.nickname, seat, type: player.type ?? "human", botDifficulty: player.botDifficulty, status: "playing", connected: player.connected ?? true }));
  const blackHandEligiblePlayerIds = players.filter((player) => isAllBlackPickRedHand(hands[player.id], players.length)).map((player) => player.id);
  return {
    phase: blackHandEligiblePlayerIds.length ? "black-hand-decision" : "playing-hand", players, hands, tableCards, drawPile: deck.slice(28),
    capturedCards: Object.fromEntries(players.map((player) => [player.id, []])), currentPlayerId: players[0].id,
    pendingCard: null, legalTargetIds: [], targetDeadline: null, scores: Object.fromEntries(players.map((player) => [player.id, 0])),
    startingPlayerId: players[0].id, roundNumber: 1, turnNumber: 1, winners: [], processedActionIds: [], lastResult: blackHandEligiblePlayerIds.length ? "等待全黑手牌玩家決定是否重洗" : "輪到你了，請選一張手牌",
    blackHandEligiblePlayerIds, blackHandPendingPlayerIds: [...blackHandEligiblePlayerIds], revealedBlackHandPlayerId: null, revealedBlackHandCards: []
  };
}

/** 判斷手牌是否符合全黑重洗資格；四人局的黑桃 A 不視為黑牌。 */
export function isAllBlackPickRedHand(hand: Card[], playerCount: number): boolean {
  return hand.length > 0 && hand.every((card) => card.suit === "clubs" || (card.suit === "spades" && !(playerCount === 4 && card.rank === "A")));
}

/** 記錄合資格玩家選擇保留全黑手牌；所有人決定保留後開始遊戲。 */
export function keepPickRedBlackHand(state: PickRedPointsState, playerId: string, actionId: string): PickRedPointsState {
  assertAction(state, actionId);
  if (state.phase !== "black-hand-decision") throw new Error("INVALID_PHASE");
  if (!state.blackHandPendingPlayerIds.includes(playerId)) throw new Error("BLACK_HAND_DECISION_NOT_ALLOWED");
  const pending = state.blackHandPendingPlayerIds.filter((id) => id !== playerId);
  return markAction({ ...state, blackHandPendingPlayerIds: pending, phase: pending.length ? "black-hand-decision" : "playing-hand", lastResult: pending.length ? "等待其他全黑手牌玩家決定" : "所有玩家保留手牌，遊戲開始" }, actionId);
}

/** 接受合資格玩家的重洗要求，並公開該玩家完整手牌作為全黑證明。 */
export function requestPickRedBlackHandReshuffle(state: PickRedPointsState, playerId: string, actionId: string): PickRedPointsState {
  assertAction(state, actionId);
  if (state.phase !== "black-hand-decision") throw new Error("INVALID_PHASE");
  if (!state.blackHandPendingPlayerIds.includes(playerId)) throw new Error("BLACK_HAND_DECISION_NOT_ALLOWED");
  return markAction({ ...state, phase: "black-hand-reveal", revealedBlackHandPlayerId: playerId, revealedBlackHandCards: [...state.hands[playerId]], lastResult: `${state.players.find((player) => player.id === playerId)?.nickname ?? "玩家"} 展示全黑手牌，準備重洗` }, actionId);
}

/** 依玩家人數計算每位玩家應取得的手牌張數。 */
export function getPickRedDealCount(playerCount: number) { if (![2, 3, 4].includes(playerCount)) throw new Error("Player count must be 2, 3 or 4."); return 24 / playerCount; }
/** 找出桌面上所有能與指定牌合法配對的牌。 */
export function getMatchingTableCards(card: Card, tableCards: TableCard[]) { return tableCards.filter((tableCard) => isValidPickRedPair(card, tableCard.card)); }
/** 判斷兩張牌是否符合數字合計十或同人頭牌的配對規則。 */
export function isValidPickRedPair(played: Card, table: Card): boolean {
  const faces: Rank[] = ["10", "J", "Q", "K"];
  if (faces.includes(played.rank) || faces.includes(table.rank)) return played.rank === table.rank;
  const value = (rank: Rank) => rank === "A" ? 1 : Number(rank);
  return value(played.rank) + value(table.rank) === 10;
}

/** 驗證並打出一張手牌，再依可配對目標數量進入選牌、吃牌或翻牌流程。 */
export function playPickRedHandCard(state: PickRedPointsState, playerId: string, cardId: string, now = Date.now(), actionId = `play-${now}`): PickRedPointsState {
  assertAction(state, actionId);
  if (state.phase !== "playing-hand") throw new Error("INVALID_PHASE");
  if (state.currentPlayerId !== playerId) throw new Error("NOT_YOUR_TURN");
  const card = state.hands[playerId]?.find((item) => item.id === cardId);
  if (!card) throw new Error("CARD_NOT_IN_HAND");
  const legalTargets = getMatchingTableCards(card, state.tableCards);
  const next = markAction({ ...state, pendingCard: { card, source: "hand", ownerPlayerId: playerId }, legalTargetIds: legalTargets.map((item) => item.card.id), targetDeadline: legalTargets.length > 1 ? now + TARGET_SELECTION_MS : null, phase: legalTargets.length > 1 ? "selecting-hand-target" : "drawing", lastResult: legalTargets.length > 1 ? "請選擇一張桌牌配對" : legalTargets.length === 1 ? "自動配對唯一可選的桌牌" : `${card.rank} 沒有可配對的牌，將留在桌上` }, actionId);
  if (legalTargets.length === 1) return capturePickRedPair(next, playerId, legalTargets[0].card.id, now);
  return legalTargets.length > 1 ? next : placePickRedCardOnTable(next, playerId);
}

/** 驗證玩家選擇的桌牌目標，並完成該次合法配對。 */
export function selectPickRedCaptureTarget(state: PickRedPointsState, playerId: string, targetCardId: string, pendingSource: "hand" | "draw", now = Date.now(), actionId = `target-${now}`): PickRedPointsState {
  assertAction(state, actionId);
  if (state.currentPlayerId !== playerId) throw new Error("NOT_YOUR_TURN");
  if (!state.pendingCard || state.pendingCard.ownerPlayerId !== playerId || state.pendingCard.source !== pendingSource) throw new Error("TARGET_SELECTION_REQUIRED");
  if (!state.legalTargetIds.includes(targetCardId)) throw new Error("INVALID_CAPTURE_PAIR");
  return capturePickRedPair(markAction(state, actionId), playerId, targetCardId, now);
}

/** 從抽牌堆翻開一張牌並保留正面展示狀態，讓所有玩家看清翻牌結果。 */
export function drawPickRedCard(state: PickRedPointsState, playerId: string, _now = Date.now()): PickRedPointsState {
  if (state.phase !== "drawing") throw new Error("INVALID_PHASE");
  if (state.currentPlayerId !== playerId) throw new Error("NOT_YOUR_TURN");
  const card = state.drawPile[0];
  if (!card) return finishPickRedTurn({ ...state, phase: "turn-result", pendingCard: null }, "抽牌堆已空");
  const next = { ...state, drawPile: state.drawPile.slice(1), turnNumber: state.turnNumber + 1 };
  const legalTargets = getMatchingTableCards(card, next.tableCards);
  return { ...next, phase: "revealing-draw", pendingCard: { card, source: "draw", ownerPlayerId: playerId }, legalTargetIds: legalTargets.map((item) => item.card.id), targetDeadline: null, lastResult: `翻出 ${card.rank}` };
}

/** 結束翻牌展示；無配對就落桌、單一配對自動收牌，多個配對則等待玩家選擇。 */
export function resolvePickRedDrawReveal(state: PickRedPointsState, now = Date.now()): PickRedPointsState {
  if (state.phase !== "revealing-draw" || !state.pendingCard || state.pendingCard.source !== "draw") return state;
  const playerId = state.pendingCard.ownerPlayerId;
  if (!state.legalTargetIds.length) return finishPickRedTurn(placePickRedCardOnTable(state, playerId), "翻牌沒有配對，牌留在桌上");
  if (state.legalTargetIds.length === 1) return capturePickRedPair(state, playerId, state.legalTargetIds[0], now);
  return { ...state, phase: "selecting-draw-target", targetDeadline: now + TARGET_SELECTION_MS, lastResult: "翻出的牌有多個配對，請選擇桌牌" };
}

/** 將等待中的牌與指定桌牌交給玩家，移除桌牌並重新計算所有玩家分數。 */
export function capturePickRedPair(state: PickRedPointsState, playerId: string, targetCardId: string, _now = Date.now()): PickRedPointsState {
  const pending = state.pendingCard;
  if (!pending || pending.ownerPlayerId !== playerId) throw new Error("TARGET_SELECTION_REQUIRED");
  const target = state.tableCards.find((item) => item.card.id === targetCardId);
  if (!target || !isValidPickRedPair(pending.card, target.card)) throw new Error("INVALID_CAPTURE_PAIR");
  const capturedCards = { ...state.capturedCards, [playerId]: [...state.capturedCards[playerId], pending.card, target.card] };
  const scores = calculatePickRedScores(capturedCards, state.players.map((player) => player.id));
  const scoreChange = scores[playerId] - (state.scores[playerId] ?? 0);
  const hands = pending.source === "hand" ? { ...state.hands, [playerId]: state.hands[playerId].filter((card) => card.id !== pending.card.id) } : state.hands;
  const next = { ...state, hands, phase: pending.source === "hand" ? "drawing" as const : "turn-result" as const, tableCards: state.tableCards.filter((item) => item.card.id !== targetCardId), capturedCards, scores, pendingCard: null, legalTargetIds: [], targetDeadline: null, lastResult: `撿到${pending.card.rank}與${target.card.rank}，${scoreChange >= 0 ? "+" : ""}${scoreChange}分` };
  return pending.source === "hand" ? next : finishPickRedTurn(next);
}

/** 在沒有合法配對時，將等待中的牌正面加入桌面。 */
export function placePickRedCardOnTable(state: PickRedPointsState, playerId: string): PickRedPointsState {
  const pending = state.pendingCard;
  if (!pending || pending.ownerPlayerId !== playerId) throw new Error("TARGET_SELECTION_REQUIRED");
  const tableCard: TableCard = { card: pending.card, enteredAtTurn: state.turnNumber, tableOrder: state.tableCards.length ? Math.max(...state.tableCards.map((item) => item.tableOrder)) + 1 : 0 };
  const hands = pending.source === "hand" ? { ...state.hands, [playerId]: state.hands[playerId].filter((card) => card.id !== pending.card.id) } : state.hands;
  return { ...state, hands, phase: "drawing", tableCards: [...state.tableCards, tableCard], pendingCard: null, legalTargetIds: [], targetDeadline: null, lastResult: "牌已放到桌面" };
}

/** 選牌逾時時，自動選擇分數最高、同分時最早進桌的合法目標。 */
export function resolvePickRedTargetTimeout(state: PickRedPointsState, now = Date.now()): PickRedPointsState {
  if (!state.pendingCard || !state.targetDeadline || now < state.targetDeadline) return state;
  const target = state.tableCards.filter((item) => state.legalTargetIds.includes(item.card.id)).sort((left, right) => getPickRedCaptureGain(state, state.pendingCard!.ownerPlayerId, state.pendingCard!.card, right.card) - getPickRedCaptureGain(state, state.pendingCard!.ownerPlayerId, state.pendingCard!.card, left.card) || calculatePickRedCardScore(right.card, state.players.length) - calculatePickRedCardScore(left.card, state.players.length) || left.tableOrder - right.tableOrder)[0];
  if (!target) throw new Error("TARGET_SELECTION_REQUIRED");
  return capturePickRedPair(state, state.pendingCard.ownerPlayerId, target.card.id, now);
}

/** 模擬一次吃牌後的即時分數差，包含四人局雙紅五的實際轉帳。 */
export function getPickRedCaptureGain(state: PickRedPointsState, playerId: string, playedCard: Card, tableCard: Card): number {
  const playerIds = state.players.map((player) => player.id);
  const capturedCards = { ...state.capturedCards, [playerId]: [...(state.capturedCards[playerId] ?? []), playedCard, tableCard] };
  const nextScores = calculatePickRedScores(capturedCards, playerIds);
  return (nextScores[playerId] ?? 0) - (state.scores[playerId] ?? 0);
}

/** 依座位順序取得下一位玩家，最後一位之後回到第一位。 */
export function getNextPickRedPlayer(state: PickRedPointsState, playerId = state.currentPlayerId): string | null { if (!playerId) return null; const index = state.players.findIndex((player) => player.id === playerId); return index < 0 ? null : state.players[(index + 1) % state.players.length]?.id ?? null; }
/** 判斷手牌、抽牌堆及待處理配對是否全部清空。 */
export function isPickRedGameFinished(state: PickRedPointsState) { return Object.values(state.hands).every((hand) => hand.length === 0) && state.drawPile.length === 0 && !state.pendingCard && !["selecting-hand-target", "revealing-draw", "selecting-draw-target"].includes(state.phase); }
/** 依零分逆轉或人數門檻規則取得最終贏家 ID。 */
export function getPickRedWinners(state: PickRedPointsState): string[] {
  const playerIds = state.players.map((player) => player.id);
  const final = finalizePickRedScores(state.capturedCards, playerIds);
  if (final.noScorePlayerIds.length) return final.noScorePlayerIds;
  const winningScore = getPickRedWinningScore(playerIds.length);
  return playerIds.filter((playerId) => final.scores[playerId] >= winningScore);
}
/** 移除私人手牌、抽牌順序與去重資料，建立可公開的牌局狀態。 */
export function getVisiblePickRedState(state: PickRedPointsState): VisiblePickRedPointsState {
  const { hands, drawPile, processedActionIds: _processed, ...publicState } = state;
  return { ...publicState, handCounts: Object.fromEntries(Object.entries(hands).map(([id, hand]) => [id, hand.length])), drawPileCount: drawPile.length };
}

/** 完成目前回合；若牌局已清空則執行最終計分與贏家判定。 */
function finishPickRedTurn(state: PickRedPointsState, result?: string): PickRedPointsState { if (isPickRedGameFinished(state)) { const playerIds = state.players.map((player) => player.id); const final = finalizePickRedScores(state.capturedCards, playerIds); const finalState = { ...state, scores: final.scores }; const winners = getPickRedWinners(finalState); return { ...finalState, phase: "finished", currentPlayerId: null, winners, lastResult: result ?? "本局結束" }; } return { ...state, phase: "playing-hand", currentPlayerId: getNextPickRedPlayer(state), roundNumber: state.roundNumber + 1, lastResult: result ?? state.lastResult }; }
/** 驗證 actionId 存在且尚未處理，避免同一操作重複執行。 */
function assertAction(state: PickRedPointsState, actionId: string) { if (!actionId) throw new Error("Missing actionId."); if (state.processedActionIds.includes(actionId)) throw new Error("ACTION_ALREADY_PROCESSED"); }
/** 將 actionId 記錄到新狀態，供後續重複動作檢查。 */
function markAction(state: PickRedPointsState, actionId: string): PickRedPointsState { return { ...state, processedActionIds: [...state.processedActionIds, actionId] }; }
