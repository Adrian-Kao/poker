import { createStandardDeck } from "../core/cards";
import { shuffle, type RandomSource } from "../core/random";
import type { SevensCard, SevensMode } from "./types";

export function createSevensDoubleDeck(): SevensCard[] {
  return [0, 1].flatMap((deckIndex) =>
    createStandardDeck().map((card) => ({
      ...card,
      id: `deck-${deckIndex}-${card.suit}-${card.rank}`,
      deckIndex
    }))
  );
}

export function createSevensDeck(mode: SevensMode, random: RandomSource = Math.random): SevensCard[] {
  const deck = mode === "classic-four"
    ? createStandardDeck().map((card) => ({ ...card, deckIndex: 0 }))
    : createSevensDoubleDeck().filter(
        (card) => !(card.deckIndex === 1 && card.suit === "spades" && card.rank === "7")
      );
  return shuffle(deck, random);
}

export function dealSevensCards(deck: readonly SevensCard[], playerIds: readonly string[]) {
  if (playerIds.length === 0) throw new Error("Cannot deal without players.");
  const hands: Record<string, SevensCard[]> = Object.fromEntries(
    playerIds.map((id) => [id, [] as SevensCard[]])
  );
  deck.forEach((card, index) => hands[playerIds[index % playerIds.length]].push(card));
  return hands;
}
