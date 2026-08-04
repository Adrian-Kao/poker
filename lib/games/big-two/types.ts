import type { Card } from "../core/cards";

export type BigTwoCombinationType = "single" | "pair" | "straight" | "full-house" | "four-of-a-kind" | "straight-flush";
export type BigTwoErrorCode = "NOT_YOUR_TURN" | "GAME_NOT_PLAYING" | "CARD_NOT_OWNED" | "DUPLICATE_CARD_ID" | "INVALID_CARD_COUNT" | "INVALID_COMBINATION" | "MUST_INCLUDE_THREE_OF_CLUBS" | "CANNOT_PASS_ON_LEAD" | "MUST_MATCH_CARD_COUNT" | "PLAY_NOT_HIGH_ENOUGH" | "ACTION_ALREADY_PROCESSED" | "GAME_ALREADY_FINISHED";
export type BigTwoCombination = { type: BigTwoCombinationType; size: 1 | 2 | 5; isBomb: boolean; categoryRank: number; comparisonKey: number[] };
export type BigTwoPlayer = { id: string; nickname: string; seat: number; type: "human" | "bot"; botDifficulty?: "easy" | "normal" | "hard"; status: "playing" | "winner"; connected: boolean; plays: number; passes: number };
export type BigTwoPlay = { id: string; playerId: string; cards: Card[]; combination: BigTwoCombination; playedAt: number; turnNumber: number };
export type BigTwoState = { phase: "playing" | "finished"; playerCount: 3 | 4; players: BigTwoPlayer[]; hands: Record<string, Card[]>; bonusCardRecipientId: string | null; openingRevealCards: Record<string, Card[]>; currentPlayerId: string | null; trickLeaderId: string | null; lastPlay: BigTwoPlay | null; playHistory: BigTwoPlay[]; passedPlayerIds: string[]; firstTurnPending: boolean; turnNumber: number; winnerIds: string[]; winReason: "normal" | "thirteen-rank-dragon" | null; actionIds: string[] };
export class BigTwoRuleError extends Error { constructor(readonly code: BigTwoErrorCode) { super(code); } }

