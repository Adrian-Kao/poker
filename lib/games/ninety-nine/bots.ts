import type { RandomSource } from "../core/random";
import { getLegalActions, getTargetablePlayers } from "./actions";
import type { BotDifficulty, LegalNinetyNineAction, NinetyNineState } from "./types";

export function chooseNinetyNineBotAction(state: NinetyNineState, playerId = state.currentPlayerId, difficulty: BotDifficulty = "normal", random: RandomSource = Math.random) {
  const legal = getLegalActions(state, playerId);
  if (legal.length === 0) return null;
  if (difficulty === "easy") return pick(legal, random);

  const scored = legal.map((action) => ({ action, score: scoreAction(state, action, difficulty) }));
  const bestScore = Math.max(...scored.map((item) => item.score));
  return pick(scored.filter((item) => item.score === bestScore).map((item) => item.action), random);
}

export function getBotThinkDelayMs(difficulty: BotDifficulty, random: RandomSource = Math.random) {
  if (difficulty === "easy") return randomRange(900, 1500, random);
  if (difficulty === "hard") return randomRange(400, 800, random);
  return randomRange(650, 1100, random);
}

function scoreAction(state: NinetyNineState, action: LegalNinetyNineAction, difficulty: BotDifficulty) {
  let score = 100 - Math.abs(72 - action.resultingTotal);
  if (action.resultingTotal >= 95) score -= difficulty === "hard" ? 28 : 16;
  if (action.effectLabel.includes("-")) score += state.currentTotal >= 80 ? 24 : 4;
  if (action.effectLabel === "迴轉" || action.effectLabel === "Pass" || action.effectLabel === "指定下一位") score += state.currentTotal >= 90 ? 18 : 5;
  if (action.effectLabel === "設為 99") score += state.currentTotal >= 90 ? 16 : -12;
  if (action.choice.kind === "target-player") {
    const targetPlayerId = action.choice.targetPlayerId;
    const target = getTargetablePlayers(state, action.playerId).find((player) => player.id === targetPlayerId);
    score += target ? Math.max(0, 6 - (state.hands[target.id]?.length ?? 5)) * 8 : 0;
  }
  return score;
}

function pick<T>(items: T[], random: RandomSource) {
  return items[Math.floor(random() * items.length)];
}

function randomRange(min: number, max: number, random: RandomSource) {
  return Math.floor(min + random() * (max - min + 1));
}
