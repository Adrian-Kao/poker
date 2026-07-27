import { HEART_ATTACK_CALL_MAX } from "./constants";
import type { HeartAttackCard } from "./types";

export function getNextCallNumber(callNumber: number) {
  return callNumber >= HEART_ATTACK_CALL_MAX ? 1 : callNumber + 1;
}

export function getCalledRankValue(card: HeartAttackCard) {
  if (card.rank === "A") return 1;
  if (card.rank === "J") return 11;
  if (card.rank === "Q") return 12;
  if (card.rank === "K") return 13;
  if (card.rank === "JOKER") return null;
  return Number(card.rank);
}

export function isSlapTrigger(card: HeartAttackCard, calledNumber: number) {
  return getCalledRankValue(card) === calledNumber;
}
