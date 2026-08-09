import type { SevensCard, SevensMode, SevensStanding } from "../../lib/games/sevens";

export type SevensClientMessage =
  | { type: "SET_READY"; actionId: string; ready: boolean }
  | { type: "SET_SETTINGS"; actionId: string; mode: SevensMode; maxPlayers: number }
  | { type: "START_GAME"; actionId: string }
  | { type: "ADD_BOT"; actionId: string; difficulty: "easy" | "normal" | "hard" }
  | { type: "REMOVE_BOT"; actionId: string; botId: string }
  | { type: "PLAY_CARD"; actionId: string; cardId: string }
  | { type: "COVER_CARD"; actionId: string; cardId: string }
  | { type: "REQUEST_STATE"; actionId: string }
  | { type: "PLAY_AGAIN"; actionId: string }
  | { type: "CLOSE_ROOM"; actionId: string };

export type SevensServerEvent =
  | { type: "GAME_STARTED" }
  | { type: "PRIVATE_HAND"; cards: SevensCard[] }
  | { type: "CARD_PLAYED"; playerId: string; card: SevensCard }
  | { type: "CARD_COVERED"; playerId: string; card: SevensCard }
  | { type: "TURN_CHANGED"; playerId: string }
  | { type: "GAME_FINISHED"; winnerId: string; standings: SevensStanding[] }
  | { type: "ROOM_CLOSED"; reason: "left" | "cancelled" }
  | { type: "ACTION_REJECTED"; actionId?: string; reason: string };
