import type { Card } from "../core/cards";
import { createStandardDeck } from "../core/cards";
import { shuffle, type RandomSource } from "../core/random";

/** 建立撿紅點使用的 52 張標準牌；傳入亂數來源時會回傳洗牌後的牌組。 */
export function createPickRedPointsDeck(random?: RandomSource): Card[] {
  const deck = createStandardDeck();
  return random ? shuffle(deck, random) : deck;
}
