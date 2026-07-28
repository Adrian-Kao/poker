import type { BotDifficulty, HeartAttackCard, PenaltyResult, PlayedCard, RoundResult } from "../../lib/games/heart-attack";

export type HeartAttackClientMessage =
  | {
      type: "SET_READY";
      actionId: string;
      ready: boolean;
    }
  | {
      type: "START_GAME";
      actionId: string;
    }
  | {
      type: "ADD_BOT";
      actionId: string;
      difficulty: BotDifficulty;
    }
  | {
      type: "REMOVE_BOT";
      actionId: string;
      botId: string;
    }
  | {
      type: "SLAP";
      actionId: string;
    }
  | {
      type: "PLAY_AGAIN";
      actionId: string;
    }
  | {
      type: "CLOSE_ROOM";
      actionId: string;
    };

export type PublicPlayedCard = Omit<PlayedCard, "card"> & {
  card: HeartAttackCard;
};

export type PenaltyNotice = {
  id: string;
  reason: "false-slap" | "slowest-slap" | "timeout" | "pending-finish-failed";
  playerId: string;
  playerName: string;
  collectedCards: number;
  fastestPlayerId?: string;
  fastestPlayerName?: string;
  createdAt: number;
  displayUntil: number;
};

export type HeartAttackServerEvent =
  | {
      type: "GAME_STARTED";
    }
  | {
      type: "CARD_PLAYED";
      playedCard: PublicPlayedCard;
    }
  | {
      type: "SLAP_WINDOW_OPENED";
      deadline: number;
    }
  | {
      type: "SLAP_ACCEPTED";
      playerId: string;
      reactionMs: number;
    }
  | {
      type: "ROUND_RESULT";
      result: RoundResult;
    }
  | {
      type: "PENALTY_NOTICE";
      notice: PenaltyNotice;
    }
  | {
      type: "GAME_FINISHED";
      winnerId: string;
    }
  | {
      type: "ROOM_CLOSED";
      reason: "left" | "cancelled";
    }
  | {
      type: "ACTION_REJECTED";
      actionId?: string;
      reason: string;
    };

export function toPenaltyNotice(result: PenaltyResult, displayMs: number, fastest?: { id: string; name: string }): PenaltyNotice {
  return {
    id: `${result.occurredAt}-${result.playerId}-${result.reason}`,
    reason: result.reason === "no-slap" ? "timeout" : result.reason,
    playerId: result.playerId,
    playerName: result.playerName,
    collectedCards: result.cardsTaken,
    fastestPlayerId: fastest?.id,
    fastestPlayerName: fastest?.name,
    createdAt: result.occurredAt,
    displayUntil: result.occurredAt + displayMs
  };
}
