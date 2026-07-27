export type Suit = "clubs" | "diamonds" | "hearts" | "spades";

export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

export const suits: Suit[] = ["clubs", "diamonds", "hearts", "spades"];
export const ranks: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export function createStandardDeck(): Card[] {
  return suits.flatMap((suit) =>
    ranks.map((rank) => ({
      id: `${suit}-${rank}`,
      suit,
      rank
    }))
  );
}

export function isSameCard(left: Card, right: Card) {
  return left.id === right.id;
}
