import type { BigTwoState } from "./types";
import { getLegalPlays } from "./engine";
export function chooseBigTwoBotAction(state: BigTwoState, playerId: string, difficulty: "easy" | "normal" | "hard" = "normal", random = Math.random) { const legal = getLegalPlays(state, playerId); if (!legal.length) return state.lastPlay ? { type: "PASS" as const } : null; if (state.lastPlay && difficulty !== "easy" && legal.length > 2 && random() < (difficulty === "hard" ? 0.5 : 0.25)) return { type: "PASS" as const }; const index = difficulty === "easy" ? Math.floor(random() * Math.min(legal.length, 4)) : 0; return { type: "PLAY_CARDS" as const, cardIds: legal[index].map((card) => card.id) }; }

