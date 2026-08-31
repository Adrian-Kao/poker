import type { Rank, Suit } from "../core/cards";

export const BIG_TWO_RANK_ORDER = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"] as const satisfies readonly Rank[];
export const BIG_TWO_SUIT_ORDER = ["clubs", "diamonds", "hearts", "spades"] as const satisfies readonly Suit[];
export const BIG_TWO_STRAIGHTS = [
  ["3", "4", "5", "6", "7"], ["4", "5", "6", "7", "8"], ["5", "6", "7", "8", "9"],
  ["6", "7", "8", "9", "10"], ["7", "8", "9", "10", "J"], ["8", "9", "10", "J", "Q"],
  ["9", "10", "J", "Q", "K"], ["10", "J", "Q", "K", "A"], ["J", "Q", "K", "A", "2"],
  ["Q", "K", "A", "2", "3"]
] as const;
export const TURN_TIMEOUT_MS = 30_000;

