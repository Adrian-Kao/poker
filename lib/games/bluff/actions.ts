import { ranks } from "../core/cards";
import type { BluffCard, BluffRank, BluffState } from "./types";

export const bluffRanks = ranks;

export function isCardMatchingClaim(card: BluffCard, claimedRank: BluffRank) {
  return card.rank === claimedRank || card.rank === "JOKER";
}

export function isBatchLie(cards: BluffCard[], claimedRank: BluffRank) {
  return cards.some((card) => !isCardMatchingClaim(card, claimedRank));
}

export function getActivePlayers(state: BluffState) {
  return state.players.filter((player) => player.status === "playing" || player.status === "pendingFinish");
}

export function getNextBluffPlayerId(state: BluffState, fromPlayerId: string): string | null {
  const ordered = [...state.players].sort((left, right) => left.seat - right.seat);
  const start = ordered.findIndex((player) => player.id === fromPlayerId);
  if (start === -1) return null;

  for (let offset = 1; offset <= ordered.length; offset += 1) {
    const player = ordered[(start + offset) % ordered.length];
    if (player.status === "playing" || player.status === "pendingFinish") return player.id;
  }

  return null;
}

