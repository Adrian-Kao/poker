import { createStandardDeck } from "../core/cards";
import type { Card } from "../core/cards";
import { shuffle, type RandomSource } from "../core/random";

export function createNinetyNineDeck(random?: RandomSource): Card[] {
  const deck = createStandardDeck();
  return random ? shuffle(deck, random) : deck;
}

