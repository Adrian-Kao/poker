import type { Card, Rank, Suit } from "../core/cards";

export type SevensMode = "classic-four" | "double-deck-race";
export type SevensDirection = "clockwise" | "counterclockwise";
export type SevensPhase = "playing" | "finished";
export type SevensBotDifficulty = "easy" | "normal" | "hard";

export interface SevensCard extends Card { deckIndex: number; }
export interface SevensPlayer {
  id: string;
  nickname: string;
  seat: number;
  type: "human" | "bot";
  botDifficulty?: SevensBotDifficulty;
  status: "playing" | "finished" | "winner";
}
export interface SevensPlayedCard extends SevensCard { playerId: string; turnNumber: number; }
export type SevensTableau = Record<Suit, Partial<Record<Rank, SevensPlayedCard>>>;
export type SevensAction =
  | { type: "PLAY_CARD"; playerId: string; cardId: string; timestamp: number }
  | { type: "COVER_CARD"; playerId: string; cardId: string; timestamp: number };
export interface SevensActionResult {
  type: SevensAction["type"];
  playerId: string;
  card: SevensCard;
  nextPlayerId: string | null;
  turnNumber: number;
  firstCoverFallback: boolean;
}
export interface SevensStanding {
  playerId: string;
  nickname: string;
  rank: number;
  coveredCount: number;
  coveredPoints: number | null;
  turnOrderIndex: number;
}
export interface SevensState {
  phase: SevensPhase;
  mode: SevensMode;
  players: SevensPlayer[];
  hands: Record<string, SevensCard[]>;
  tableau: SevensTableau;
  coveredCards: Record<string, SevensCard[]>;
  currentPlayerId: string | null;
  startingPlayerId: string;
  direction: SevensDirection;
  turnNumber: number;
  winnerId: string | null;
  standings: SevensStanding[] | null;
  lastAction: SevensActionResult | null;
}
export interface CreateSevensPlayerInput {
  id: string;
  nickname: string;
  type?: "human" | "bot";
  botDifficulty?: SevensBotDifficulty;
}
export interface CreateSevensGameOptions {
  mode: SevensMode;
  players: CreateSevensPlayerInput[];
  random?: () => number;
  seed?: number;
}
export interface VisibleSevensState extends Omit<SevensState, "hands" | "coveredCards"> {
  handCounts: Record<string, number>;
  coveredCounts: Record<string, number>;
  ownHand: SevensCard[];
  ownCoveredCards: SevensCard[];
}
export type SevensBotMove =
  | { type: "PLAY_CARD"; cardId: string }
  | { type: "COVER_CARD"; cardId: string };
