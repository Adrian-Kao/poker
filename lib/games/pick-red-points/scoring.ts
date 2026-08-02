import type { Card } from "../core/cards";

export function calculatePickRedCardScore(card: Card): number {
  if (card.suit === "hearts" || card.suit === "diamonds") {
    if (card.rank === "A") return 20;
    if (["2", "3", "4", "5", "6", "7", "8"].includes(card.rank)) return Number(card.rank);
    return 10;
  }
  if (card.suit === "spades" && card.rank === "A") return 30;
  if (card.suit === "clubs" && card.rank === "A") return 40;
  return 0;
}

export function calculatePickRedPlayerScore(cards: Card[]): number { return cards.reduce((total, card) => total + calculatePickRedCardScore(card), 0); }
