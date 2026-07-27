import { botSettings } from "./constants";
import type { BotDifficulty } from "./types";

export function calculateBotReaction(difficulty: BotDifficulty, random: () => number, isTrigger: boolean): number | null {
  const settings = botSettings[difficulty];

  if (isTrigger && random() < settings.missChance) return null;
  if (!isTrigger && random() >= settings.falseSlapChance) return null;

  const range = settings.maxReactionMs - settings.minReactionMs;
  return Math.round(settings.minReactionMs + random() * range);
}
