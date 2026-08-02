import type { Rank, Suit } from "../core/cards";

export type BotDifficulty = "easy" | "normal" | "hard";
export type BluffRank = Rank;
export type BluffCardRank = Rank | "JOKER";
export type BluffSuit = Suit | null;
export type BluffPhase = "waiting" | "playing" | "reaction-window" | "round-result" | "finished";

export interface BluffCard {
  id: string;
  suit: BluffSuit;
  rank: BluffCardRank;
}

export interface BluffPlayer {
  id: string;
  nickname: string;
  seat: number;
  type: "human" | "bot";
  botDifficulty?: BotDifficulty;
  status: "playing" | "pendingFinish" | "winner" | "loser";
  connected: boolean;
}

export type CreateBluffPlayerInput = {
  id: string;
  nickname: string;
  type?: "human" | "bot";
  botDifficulty?: BotDifficulty;
  connected?: boolean;
};

export interface BluffBatch {
  id: string;
  playerId: string;
  cardIds: string[];
  addedCount: number;
  claimedRank: BluffRank;
  playedAt: number;
  turnNumber: number;
}

export interface PlayedBluffCard {
  card: BluffCard;
  playerId: string;
  batchId: string;
  claimedRank: BluffRank;
  playedAt: number;
}

export interface BluffReaction {
  playerId: string;
  choice: "trust" | "challenge";
  receivedAt: number;
  actionId: string;
}

export interface BluffRoundResult {
  challengerId: string | null;
  challengedPlayerId: string;
  penaltyPlayerId: string;
  isLie: boolean;
  revealedCards: BluffCard[];
  collectedCardCount: number;
  message: string;
}

export interface BluffFourOfKindClear {
  playerId: string;
  rank: BluffRank;
  cards: BluffCard[];
}

export interface BluffState {
  phase: BluffPhase;
  players: BluffPlayer[];
  hands: Record<string, BluffCard[]>;
  centerPile: PlayedBluffCard[];
  discardPile: BluffCard[];
  batches: BluffBatch[];
  roundClaimRank: BluffRank | null;
  roundClaimCount: number;
  currentPlayerId: string | null;
  lastBatchId: string | null;
  reactions: BluffReaction[];
  reactionStartedAt: number | null;
  reactionDeadline: number | null;
  reviewerId: string | null;
  roundResult: BluffRoundResult | null;
  lastFourOfKindClears?: BluffFourOfKindClear[];
  winnerId: string | null;
  turnNumber: number;
}

export type BluffAction =
  | { type: "PLAY_CARDS"; playerId: string; cardIds: string[]; roundClaimRank?: BluffRank; timestamp?: number }
  | { type: "REACT_TO_CLAIM"; playerId: string; choice: "trust" | "challenge"; actionId: string; timestamp?: number }
  | { type: "DISCARD_FOUR_OF_KIND"; playerId: string; cardIds: [string, string, string, string]; representedRank: BluffRank };

export type LegalBluffAction = {
  type: "PLAY_CARDS";
  playerId: string;
  cardIds: string[];
  roundClaimRank: BluffRank;
};
