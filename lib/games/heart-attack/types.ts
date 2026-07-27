import type { Rank, Suit } from "../core/cards";

export type HeartAttackRank = Rank | "JOKER";
export type HeartAttackSuit = Suit | null;

export interface HeartAttackCard {
  id: string;
  deckIndex: number;
  suit: HeartAttackSuit;
  rank: HeartAttackRank;
}

export type HeartAttackPhase = "waiting" | "playing" | "slap-window" | "round-result" | "finished";
export type HeartAttackPlayerType = "human" | "bot";
export type BotDifficulty = "easy" | "normal" | "hard";
export type HeartAttackPlayerStatus = "playing" | "pendingFinish" | "winner";

export interface HeartAttackPlayer {
  id: string;
  nickname: string;
  seat: number;
  type: HeartAttackPlayerType;
  botDifficulty?: BotDifficulty;
  status: HeartAttackPlayerStatus;
}

export interface PlayedCard {
  card: HeartAttackCard;
  playedBy: string;
  calledNumber: number;
  playedAt: number;
}

export interface SlapResponse {
  playerId: string;
  timestamp: number;
  valid: boolean;
}

export interface RoundResult {
  trigger: PlayedCard | null;
  winnerId: string | null;
  penaltyPlayerId: string | null;
  collectedCardCount: number;
  reason: "correct-slap" | "false-slap" | "slowest-slap" | "no-slap" | "pending-finish-failed" | "finish";
}

export type PenaltyReason = "false-slap" | "slowest-slap" | "no-slap" | "pending-finish-failed";

export interface PenaltyResult {
  reason: PenaltyReason;
  playerId: string;
  playerName: string;
  cardsTaken: number;
  cardIds: string[];
  responseTimeMs: number | null;
  occurredAt: number;
}

export interface HeartAttackState {
  phase: HeartAttackPhase;
  players: HeartAttackPlayer[];
  playerDecks: Record<string, HeartAttackCard[]>;
  centerPile: PlayedCard[];
  currentPlayerId: string | null;
  callNumber: number;
  slapResponses: SlapResponse[];
  slapDeadline: number | null;
  roundResult: RoundResult | null;
  penaltyResult: PenaltyResult | null;
  winnerId: string | null;
  turnNumber: number;
  autoPlayIntervalMs: number;
  nextAutoPlayAt: number | null;
  isAutoPlayPaused: boolean;
}

export type CreateHeartAttackPlayerInput = {
  id: string;
  nickname: string;
  type?: HeartAttackPlayerType;
  botDifficulty?: BotDifficulty;
};

export type HeartAttackPlayerAction = {
  type: "SLAP";
  playerId: string;
  timestamp: number;
};

export type HeartAttackSystemAction = {
  type: "AUTO_PLAY_TICK";
  timestamp: number;
};

export type HeartAttackAction = HeartAttackPlayerAction | HeartAttackSystemAction;
