import { createStandardDeck } from "../core/cards";
import { shuffle, type RandomSource } from "../core/random";
import type { BluffCard } from "./types";

export function createBluffDeck(random: RandomSource): BluffCard[] {
  return shuffle(
    [
      ...createStandardDeck(),
      { id: "joker-red", suit: null, rank: "JOKER" },
      { id: "joker-black", suit: null, rank: "JOKER" }
    ],
    random
  );
}

