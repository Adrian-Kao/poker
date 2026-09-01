import type { Card } from "../core/cards";

export type BotDifficulty = "easy" | "normal" | "hard";
export type PickRedPointsPhase = "waiting" | "black-hand-decision" | "black-hand-reveal" | "bottom-card-confirmation" | "playing-hand" | "selecting-hand-target" | "drawing" | "revealing-draw" | "selecting-draw-target" | "turn-result" | "finished";

export interface PickRedPointsPlayer {
  id: string;
  nickname: string;
  seat: number;
  type: "human" | "bot";
  botDifficulty?: BotDifficulty;
  status: "playing" | "winner" | "tie" | "finished";
  connected: boolean;
}

export interface TableCard { card: Card; enteredAtTurn: number; tableOrder: number; }
export interface PendingCard { card: Card; source: "hand" | "draw"; ownerPlayerId: string; }

export type PickRedPointsAction =
  | { type: "PLAY_HAND_CARD"; actionId: string; cardId: string }
  | { type: "SELECT_CAPTURE_TARGET"; actionId: string; targetCardId: string; pendingSource: "hand" | "draw" };

export interface PickRedPointsState {
  phase: PickRedPointsPhase;
  players: PickRedPointsPlayer[];
  hands: Record<string, Card[]>;
  tableCards: TableCard[];
  drawPile: Card[];
  capturedCards: Record<string, Card[]>;
  currentPlayerId: string | null;
  pendingCard: PendingCard | null;
  legalTargetIds: string[];
  targetDeadline: number | null;
  scores: Record<string, number>;
  startingPlayerId: string | null;
  roundNumber: number;
  turnNumber: number;
  winners: string[];
  processedActionIds: string[];
  lastResult: string;
  blackHandEligiblePlayerIds: string[];
  blackHandPendingPlayerIds: string[];
  revealedBlackHandPlayerId: string | null;
  revealedBlackHandCards: Card[];
}

export type CreatePickRedPointsPlayerInput = { id: string; nickname: string; type?: "human" | "bot"; botDifficulty?: BotDifficulty; connected?: boolean };
export type VisiblePickRedPointsState = Omit<PickRedPointsState, "hands" | "drawPile" | "processedActionIds"> & { handCounts: Record<string, number>; drawPileCount: number };
