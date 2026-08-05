import type { RandomSource } from "../core/random";
import { SEVENS_BOT_DELAY_MAX_MS, SEVENS_BOT_DELAY_MIN_MS, SEVENS_RANK_VALUE } from "./constants";
import { canCoverCard, getLegalPlays } from "./engine";
import type { SevensBotDifficulty, SevensBotMove, SevensCard, SevensState } from "./types";

export function calculateBotMove(state: SevensState, playerId = state.currentPlayerId, difficulty: SevensBotDifficulty = "normal", random: RandomSource = Math.random): SevensBotMove | null {
  if (!playerId || state.currentPlayerId !== playerId) return null;
  const legal = getLegalPlays(state, playerId);
  if (legal.length > 0) {
    const card = difficulty === "easy" ? pick(legal, random) : bestPlay(state, playerId, legal, random);
    return { type: "PLAY_CARD", cardId: card.id };
  }
  const coverable = (state.hands[playerId] ?? []).filter((card) => canCoverCard(state, playerId, card.id));
  if (coverable.length === 0) return null;
  const card = difficulty === "easy" ? pick(coverable, random) : [...coverable].sort((left, right) => coverScore(state, left) - coverScore(state, right))[0];
  return { type: "COVER_CARD", cardId: card.id };
}

export function getSevensBotDelayMs(random: RandomSource = Math.random) {
  return Math.floor(SEVENS_BOT_DELAY_MIN_MS + random() * (SEVENS_BOT_DELAY_MAX_MS - SEVENS_BOT_DELAY_MIN_MS + 1));
}

function bestPlay(state: SevensState, playerId: string, cards: SevensCard[], random: RandomSource) {
  const hand = state.hands[playerId] ?? [];
  const scored = cards.map((card) => {
    const rank = SEVENS_RANK_VALUE[card.rank];
    const nextRank = rank < 7 ? rank - 1 : rank + 1;
    return { card, score: hand.some((candidate) => candidate.suit === card.suit && SEVENS_RANK_VALUE[candidate.rank] === nextRank) ? 2 : 0 };
  });
  const best = Math.max(...scored.map((item) => item.score));
  return pick(scored.filter((item) => item.score === best).map((item) => item.card), random);
}

function coverScore(state: SevensState, card: SevensCard) {
  if (state.mode === "classic-four") return -SEVENS_RANK_VALUE[card.rank];
  return card.rank === "A" || card.rank === "K" ? 0 : 1;
}

function pick<T>(items: T[], random: RandomSource) { return items[Math.floor(random() * items.length)]; }
