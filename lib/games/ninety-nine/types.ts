import type { Card } from "../core/cards";

export type BotDifficulty = "easy" | "normal" | "hard";
export type NinetyNinePhase = "waiting" | "playing" | "choosing-effect" | "player-eliminated" | "finished";

export interface NinetyNinePlayer {
  id: string;
  nickname: string;
  seat: number;
  type: "human" | "bot";
  botDifficulty?: BotDifficulty;
  status: "playing" | "eliminated" | "winner";
  connected: boolean;
}

export type NinetyNinePlayChoice =
  | { kind: "fixed" }
  | { kind: "plus-minus"; value: 10 | -10 | 20 | -20 }
  | { kind: "target-player"; targetPlayerId: string };

export interface NinetyNineAction {
  type: "PLAY_CARD";
  playerId: string;
  cardId: string;
  choice: NinetyNinePlayChoice;
}

export type NinetyNineResolvedAction = {
  playerId: string;
  card: Card;
  choice: NinetyNinePlayChoice;
  previousTotal: number;
  newTotal: number;
  direction: 1 | -1;
  nextPlayerId: string | null;
  effectLabel: string;
  drewCard: boolean;
  eliminatedPlayerIds: string[];
  system: boolean;
};

export interface NinetyNineState {
  phase: NinetyNinePhase;
  players: NinetyNinePlayer[];
  hands: Record<string, Card[]>;
  drawPile: Card[];
  discardPile: Card[];
  currentTotal: number;
  currentPlayerId: string | null;
  direction: 1 | -1;
  lastAction: NinetyNineResolvedAction | null;
  eliminatedPlayerId: string | null;
  winnerId: string | null;
  turnNumber: number;
}

export type CreateNinetyNinePlayerInput = {
  id: string;
  nickname: string;
  type?: "human" | "bot";
  botDifficulty?: BotDifficulty;
  connected?: boolean;
};

export type LegalNinetyNineAction = NinetyNineAction & {
  resultingTotal: number;
  effectLabel: string;
};

export type VisibleNinetyNineState = Omit<NinetyNineState, "hands" | "drawPile"> & {
  handCounts: Record<string, number>;
  drawPileCount: number;
};

