import type { OldMaidCard } from "../../lib/games/old-maid";
import type { Rank } from "../../lib/games/core/cards";

export type OldMaidClientMessage =
  | { type: "SET_READY"; actionId: string; ready: boolean }
  | { type: "START_GAME"; actionId: string }
  | { type: "DRAW_CARD"; actionId: string; turnNumber: number; cardSlotId: string }
  | { type: "PLAY_AGAIN"; actionId: string }
  | { type: "CLOSE_ROOM"; actionId: string };

export type OldMaidServerEvent =
  | { type: "GAME_STARTED" }
  | { type: "HAND_UPDATED"; turnNumber: number; cards: OldMaidCard[] }
  | { type: "DRAW_OPTIONS_UPDATED"; turnNumber: number; targetPlayerId: string; cardSlotIds: string[] }
  | { type: "CARD_DRAWN"; playerId: string; targetPlayerId: string; system: boolean }
  | { type: "PAIRS_REMOVED"; playerId: string; ranks: Rank[] }
  | { type: "TURN_CHANGED"; playerId: string; targetPlayerId: string; turnNumber: number; deadline: number }
  | { type: "PLAYER_SAFE"; playerId: string; finishOrder: number }
  | { type: "GAME_FINISHED"; loserId: string }
  | { type: "ROOM_CLOSED"; reason: "left" | "cancelled" }
  | { type: "ACTION_REJECTED"; actionId?: string; reason: string };
