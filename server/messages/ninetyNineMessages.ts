import type { BotDifficulty, LegalNinetyNineAction, NinetyNinePlayChoice, NinetyNineResolvedAction } from "../../lib/games/ninety-nine";
import type { Card } from "../../lib/games/core/cards";

export type NinetyNineClientMessage =
  | { type: "SET_READY"; actionId: string; ready: boolean }
  | { type: "START_GAME"; actionId: string }
  | { type: "ADD_BOT"; actionId: string; difficulty: BotDifficulty }
  | { type: "REMOVE_BOT"; actionId: string; botId: string }
  | { type: "PLAY_CARD"; actionId: string; cardId: string; choice: NinetyNinePlayChoice }
  | { type: "PLAY_AGAIN"; actionId: string }
  | { type: "CLOSE_ROOM"; actionId: string };

export type NinetyNineServerEvent =
  | { type: "GAME_STARTED" }
  | {
      type: "CARD_PLAYED";
      playerId: string;
      card: Card;
      previousTotal: number;
      newTotal: number;
      effectLabel: string;
      system: boolean;
    }
  | { type: "HAND_UPDATED"; cards: Card[]; legalActions: LegalNinetyNineAction[] }
  | { type: "TURN_CHANGED"; playerId: string; deadline: number }
  | { type: "PLAYER_ELIMINATED"; playerId: string; reason: "no-legal-action" }
  | { type: "GAME_FINISHED"; winnerId: string }
  | { type: "ROOM_CLOSED"; reason: "left" | "cancelled" }
  | { type: "ACTION_REJECTED"; actionId?: string; reason: string };

export function toCardPlayedEvent(action: NinetyNineResolvedAction): NinetyNineServerEvent {
  return {
    type: "CARD_PLAYED",
    playerId: action.playerId,
    card: action.card,
    previousTotal: action.previousTotal,
    newTotal: action.newTotal,
    effectLabel: action.effectLabel,
    system: action.system
  };
}

