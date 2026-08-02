import type { Card } from "../core/cards";
import { createStandardDeck } from "../core/cards";
import { shuffle, type RandomSource } from "../core/random";

export function createPickRedPointsDeck(random?: RandomSource): Card[] {
  const deck = createStandardDeck();
  return random ? shuffle(deck, random) : deck;
}
