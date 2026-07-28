import type { BluffState } from "./types";

export function getVisibleBluffState(state: BluffState) {
  return {
    ...state,
    hands: {},
    handCounts: Object.fromEntries(Object.entries(state.hands).map(([playerId, cards]) => [playerId, cards.length]))
  };
}

