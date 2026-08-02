import { getMatchingTableCards, playPickRedHandCard, selectPickRedCaptureTarget } from "./engine";
import type { BotDifficulty, PickRedPointsState } from "./types";

export function choosePickRedBotAction(state: PickRedPointsState, playerId: string, difficulty: BotDifficulty = "normal", now = Date.now()): PickRedPointsState {
  const hand = state.hands[playerId] ?? [];
  if (state.phase === "selecting-hand-target" || state.phase === "selecting-draw-target") {
    const target = state.tableCards.filter((card) => state.legalTargetIds.includes(card.card.id)).sort((left, right) => left.tableOrder - right.tableOrder)[0];
    return target ? selectPickRedCaptureTarget(state, playerId, target.card.id, state.pendingCard?.source ?? "hand", now, `bot-target-${now}`) : state;
  }
  if (state.phase !== "playing-hand" || state.currentPlayerId !== playerId || !hand.length) return state;
  const sorted = [...hand].sort((left, right) => getMatchingTableCards(right, state.tableCards).length - getMatchingTableCards(left, state.tableCards).length);
  const card = difficulty === "easy" ? hand[0] : sorted[0];
  return playPickRedHandCard(state, playerId, card.id, now, `bot-play-${now}`);
}
