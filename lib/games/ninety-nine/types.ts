import type { Card } from "../core/cards";

export type NinetyNinePhase = "waiting" | "playing" | "finished";

export interface NinetyNinePlayer {
  id: string;
  nickname: string;
  eliminated: boolean;
}

export interface GameLogEntry {
  turnNumber: number;
  type: "GAME_CREATED" | "CARD_PLAYED" | "PLAYER_ELIMINATED" | "GAME_FINISHED";
  playerId?: string;
  message: string;
}

export interface NinetyNineState {
  phase: NinetyNinePhase;
  players: NinetyNinePlayer[];
  hands: Record<string, Card[]>;
  deck: Card[];
  discardPile: Card[];
  total: number;
  currentPlayerId: string | null;
  direction: 1 | -1;
  winnerId: string | null;
  turnNumber: number;
  actionLog: GameLogEntry[];
}

export type NinetyNineEffectChoice = 1 | 11 | 10 | -10 | 20 | -20;

export type NinetyNineAction = {
  type: "PLAY_CARD";
  playerId: string;
  cardId: string;
  effectChoice?: NinetyNineEffectChoice;
  targetPlayerId?: string;
};

export type LegalNinetyNineAction = NinetyNineAction & {
  resultingTotal: number;
};

export type CreateNinetyNinePlayerInput = {
  id: string;
  nickname: string;
};
