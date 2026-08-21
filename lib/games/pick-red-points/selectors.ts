import type { PickRedPointsState } from "./types";

/** 依玩家 ID 取得玩家資料；找不到時回傳 null。 */
export function getPickRedPlayer(state: PickRedPointsState, playerId: string) { return state.players.find((player) => player.id === playerId) ?? null; }
/** 取得指定玩家的私人手牌；找不到玩家時回傳空陣列。 */
export function getPickRedHand(state: PickRedPointsState, playerId: string) { return state.hands[playerId] ?? []; }
/** 取得目前等待玩家選擇的合法桌牌 ID。 */
export function getPickRedLegalTargetIds(state: PickRedPointsState) { return state.legalTargetIds; }
