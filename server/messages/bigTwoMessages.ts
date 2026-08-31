import type { Card } from "../../lib/games/core/cards";

export type BigTwoClientMessage =
  | { type: "SET_READY"; actionId: string; ready: boolean }
  | { type: "START_GAME"; actionId: string }
  | { type: "ADD_BOT"; actionId: string; difficulty: "easy" | "normal" | "hard" }
  | { type: "REMOVE_BOT"; actionId: string; botId: string }
  | { type: "PLAY_CARDS"; actionId: string; cardIds: string[] }
  | { type: "PASS"; actionId: string }
  | { type: "REQUEST_STATE"; actionId: string }
  | { type: "PLAY_AGAIN"; actionId: string }
  | { type: "CLOSE_ROOM"; actionId: string };

export type BigTwoServerEvent =
  | { type: "GAME_STARTED" }
  | { type: "PRIVATE_HAND"; cards: Card[]; bonusCard: boolean }
  | { type: "CARDS_PLAYED"; playerId: string; cards: Card[]; combination: string }
  | { type: "PLAYER_PASSED"; playerId: string }
  | { type: "TRICK_RESET"; leaderId: string }
  | { type: "TURN_CHANGED"; playerId: string; deadline: number }
  | { type: "GAME_FINISHED"; winnerIds: string[]; reason: string }
  | { type: "ROOM_CLOSED"; reason: "left" | "cancelled" }
  | { type: "ACTION_REJECTED"; actionId?: string; reason: string };

