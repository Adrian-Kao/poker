import type { NinetyNineState } from "./types";
import { getLegalActions } from "./actions";

export function getCurrentPlayer(state: NinetyNineState) {
  return state.players.find((player) => player.id === state.currentPlayerId) ?? null;
}

export function getPlayerHand(state: NinetyNineState, playerId: string) {
  return state.hands[playerId] ?? [];
}

export function getLegalActionsForCurrentPlayer(state: NinetyNineState) {
  return getLegalActions(state, state.currentPlayerId);
}

