import type { PickRedPointsState } from "./types";

export function getPickRedPlayer(state: PickRedPointsState, playerId: string) { return state.players.find((player) => player.id === playerId) ?? null; }
export function getPickRedHand(state: PickRedPointsState, playerId: string) { return state.hands[playerId] ?? []; }
export function getPickRedLegalTargetIds(state: PickRedPointsState) { return state.legalTargetIds; }
