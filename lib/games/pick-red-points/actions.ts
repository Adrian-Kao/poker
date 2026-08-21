import { drawPickRedCard, playPickRedHandCard, resolvePickRedTargetTimeout, selectPickRedCaptureTarget } from "./engine";
import type { PickRedPointsAction, PickRedPointsState } from "./types";

/** 將玩家送出的出牌或選牌動作交給規則引擎，回傳套用動作後的新狀態。 */
export function applyPickRedPointsAction(state: PickRedPointsState, action: PickRedPointsAction, now = Date.now()): PickRedPointsState {
  if (action.type === "PLAY_HAND_CARD") return playPickRedHandCard(state, state.currentPlayerId ?? "", action.cardId, now, action.actionId);
  return selectPickRedCaptureTarget(state, state.currentPlayerId ?? "", action.targetCardId, action.pendingSource, now, action.actionId);
}

/** 推進不需要玩家輸入的階段，例如系統翻牌或目標選擇逾時。 */
export function advancePickRedPoints(state: PickRedPointsState, now = Date.now()): PickRedPointsState {
  if (state.phase === "drawing") return drawPickRedCard(state, state.currentPlayerId ?? "", now);
  if (state.phase === "selecting-hand-target" || state.phase === "selecting-draw-target") return resolvePickRedTargetTimeout(state, now);
  return state;
}
