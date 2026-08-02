import { drawPickRedCard, playPickRedHandCard, resolvePickRedTargetTimeout, selectPickRedCaptureTarget } from "./engine";
import type { PickRedPointsAction, PickRedPointsState } from "./types";

export function applyPickRedPointsAction(state: PickRedPointsState, action: PickRedPointsAction, now = Date.now()): PickRedPointsState {
  if (action.type === "PLAY_HAND_CARD") return playPickRedHandCard(state, state.currentPlayerId ?? "", action.cardId, now, action.actionId);
  return selectPickRedCaptureTarget(state, state.currentPlayerId ?? "", action.targetCardId, action.pendingSource, now, action.actionId);
}

export function advancePickRedPoints(state: PickRedPointsState, now = Date.now()): PickRedPointsState {
  if (state.phase === "drawing") return drawPickRedCard(state, state.currentPlayerId ?? "", now);
  if (state.phase === "selecting-hand-target" || state.phase === "selecting-draw-target") return resolvePickRedTargetTimeout(state, now);
  return state;
}
