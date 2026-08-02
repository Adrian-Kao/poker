import type { BluffCard, BluffRank, BluffRoundResult, BotDifficulty } from "../../lib/games/bluff";

export type BluffClientMessage =
  | { type: "SET_READY"; actionId: string; ready: boolean }
  | { type: "START_GAME"; actionId: string }
  | { type: "ADD_BOT"; actionId: string; difficulty: BotDifficulty }
  | { type: "REMOVE_BOT"; actionId: string; botId: string }
  | { type: "PLAY_CARDS"; actionId: string; cardIds: string[]; roundClaimRank: BluffRank }
  | { type: "REACT_TO_CLAIM"; actionId: string; choice: "trust" | "challenge" }
  | { type: "PLAY_AGAIN"; actionId: string }
  | { type: "CLOSE_ROOM"; actionId: string };

export type BluffServerEvent =
  | { type: "GAME_STARTED" }
  | { type: "CARDS_PLAYED"; batchId: string; playerId: string; roundClaimRank: BluffRank; addedCount: number; centerPileCount: number }
  | { type: "REACTION_RECORDED"; playerId: string; choice: "trust" | "challenge" }
  | { type: "ROUND_RESULT"; result: BluffRoundResult }
  | { type: "FOUR_OF_KIND_CLEARED"; rank: BluffRank; cards: BluffCard[] }
  | { type: "HAND_UPDATED"; cards: BluffCard[] }
  | { type: "TURN_CHANGED"; playerId: string; deadline: number }
  | { type: "GAME_FINISHED"; winnerId: string }
  | { type: "ROOM_CLOSED"; reason: "left" | "cancelled" }
  | { type: "ACTION_REJECTED"; actionId?: string; reason: string };
