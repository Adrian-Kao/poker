export const BOT_PLAYER_NAMES: Record<`bot${number}`, string> = {
  bot1: "阿藍",
  bot2: "阿峻",
  bot3: "呱呱人",
  bot4: "阿仁",
  bot5: "帥帥",
  bot6: "電腦67",
  bot7: "電腦",
  bot8: "Mitsuhiko"
};

export function getBotPlayerName(botNumber: number) {
  const key = `bot${botNumber}` as `bot${number}`;
  return BOT_PLAYER_NAMES[key] ?? `電腦${botNumber}`;
}

export type BotNameDifficulty = "easy" | "normal" | "hard" | string | undefined;

type BotNameEntry = {
  key: `bot${number}`;
  number: number;
  name: string;
};

function getConfiguredBotNames(): BotNameEntry[] {
  return (Object.entries(BOT_PLAYER_NAMES) as Array<[`bot${number}`, string]>)
    .map(([key, name]) => ({
      key,
      number: Number(key.replace("bot", "")),
      name
    }))
    .filter((entry) => Number.isFinite(entry.number) && entry.name.trim().length > 0)
    .sort((a, b) => a.number - b.number);
}

export function getBotPlayerNameForDifficulty(
  botNumber: number,
  difficulty: BotNameDifficulty,
  random: () => number = Math.random,
  usedNames: string[] = []
) {
  if (difficulty === "hard") {
    const hardBotName = BOT_PLAYER_NAMES.bot1;
    if (!usedNames.includes(hardBotName)) return hardBotName;
  }

  const candidates = getConfiguredBotNames().filter((entry) => entry.key !== "bot1");
  const unusedCandidates = candidates.filter((entry) => !usedNames.includes(entry.name));
  const pool = unusedCandidates.length > 0 ? unusedCandidates : candidates;

  if (pool.length === 0) {
    return `電腦${botNumber}`;
  }

  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
  return pool[index]?.name ?? `電腦${botNumber}`;
}
