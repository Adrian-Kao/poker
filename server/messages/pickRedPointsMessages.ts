import type { Card } from "../../lib/games/core/cards";
import type { BotDifficulty } from "../../lib/games/pick-red-points";

export type PickRedPointsClientMessage =
  | { type: "SET_READY"; actionId: string; ready: boolean }
  | { type: "START_GAME"; actionId: string }
  | { type: "ADD_BOT"; actionId: string; difficulty: BotDifficulty }
  | { type: "KEEP_BLACK_HAND"; actionId: string }
  | { type: "RESHUFFLE_BLACK_HAND"; actionId: string }
  | { type: "PLAY_HAND_CARD"; actionId: string; cardId: string }
  | { type: "SELECT_CAPTURE_TARGET"; actionId: string; targetCardId: string; pendingSource: "hand" | "draw" }
  | { type: "CLOSE_ROOM"; actionId?: string };

export type PickRedPointsServerEvent =
  | { type: "GAME_STARTED" }
  | { type: "HAND_UPDATED"; cards: Card[]; capturedCards: Card[] }
  | { type: "STATE_EVENT"; message: string }
  | { type: "GAME_FINISHED"; winners: string[] }
  | { type: "ROOM_CLOSED"; reason: "left" }
  | { type: "ACTION_REJECTED"; actionId?: string; reason: string };
