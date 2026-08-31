import type { Rank, Suit } from "../core/cards";

export const SEVENS_CLASSIC_PLAYERS = 4;
export const SEVENS_RACE_MIN_PLAYERS = 5;
export const SEVENS_RACE_MAX_PLAYERS = 8;
export const SEVENS_BOT_DELAY_MIN_MS = 500;
export const SEVENS_BOT_DELAY_MAX_MS = 1000;

export const SEVENS_SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
export const SEVENS_RANKS: Rank[] = [
  "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"
];

export const SEVENS_RANK_VALUE: Record<Rank, number> = Object.fromEntries(
  SEVENS_RANKS.map((rank, index) => [rank, index + 1])
) as Record<Rank, number>;
