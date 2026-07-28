import type { RandomSource } from "../core/random";
import { bluffRanks } from "./actions";
import type { BluffAction, BluffRank, BluffState, BotDifficulty } from "./types";

export function chooseBluffBotPlay(state: BluffState, playerId: string, difficulty: BotDifficulty = "normal", random: RandomSource = Math.random): BluffAction | null {
  if (state.phase !== "playing" || state.currentPlayerId !== playerId) return null;
  const hand = state.hands[playerId] ?? [];
  if (hand.length === 0) return null;
  const maxCount = Math.min(3, hand.length);
  const count = difficulty === "hard" ? Math.min(maxCount, 2) : 1;
  const claim = state.roundClaimRank ?? chooseClaimRank(hand, random);
  return { type: "PLAY_CARDS", playerId, cardIds: hand.slice(0, count).map((card) => card.id), roundClaimRank: claim };
}

export function chooseBluffBotReaction(state: BluffState, _playerId: string, difficulty: BotDifficulty = "normal", random: RandomSource = Math.random): "trust" | "challenge" {
  if (!state.batches.at(-1)) return "trust";
  const chance = difficulty === "hard" ? 0.34 : difficulty === "easy" ? 0.12 : 0.22;
  return random() < chance ? "challenge" : "trust";
}

export function getBluffBotThinkDelayMs(difficulty: BotDifficulty = "normal", random: RandomSource = Math.random) {
  const base = difficulty === "hard" ? 360 : difficulty === "easy" ? 850 : 560;
  return Math.floor(base + random() * 520);
}

function chooseClaimRank(hand: BluffState["hands"][string], random: RandomSource): BluffRank {
  const nonJoker = hand.find((card) => card.rank !== "JOKER");
  if (nonJoker && nonJoker.rank !== "JOKER" && random() > 0.24) return nonJoker.rank;
  return bluffRanks[Math.floor(random() * bluffRanks.length)];
}
