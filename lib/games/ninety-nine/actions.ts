import type { Card } from "../core/cards";
import {
  NINETY_NINE_MAX_TOTAL,
  NINETY_NINE_MIN_TOTAL
} from "./constants";
import type { LegalNinetyNineAction, NinetyNineAction, NinetyNinePlayChoice, NinetyNineState } from "./types";

const normalRankValues: Partial<Record<Card["rank"], number>> = {
  A: 1,
  "2": 2,
  "3": 3,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9
};

export function getCardEffect(card: Card) {
  if (card.rank === "4") return { kind: "reverse" as const, label: "迴轉" };
  if (card.rank === "5") return { kind: "target-player" as const, label: "指定下一位" };
  if (card.rank === "10") return { kind: "plus-minus" as const, label: "+10 / -10" };
  if (card.rank === "J") return { kind: "skip" as const, label: "Pass" };
  if (card.rank === "Q") return { kind: "plus-minus" as const, label: "+20 / -20" };
  if (card.rank === "K") return { kind: "set-99" as const, label: "設為 99" };
  return { kind: "add" as const, label: `+${normalRankValues[card.rank] ?? 0}` };
}

export function getLegalChoicesForCard(state: NinetyNineState, playerId: string, card: Card): NinetyNinePlayChoice[] {
  if (card.rank === "10") {
    return ([10, -10] as const)
      .map((value) => ({ kind: "plus-minus" as const, value }))
      .filter((choice) => isTotalInBounds(calculateResultingTotal(state.currentTotal, card, choice)));
  }

  if (card.rank === "Q") {
    return ([20, -20] as const)
      .map((value) => ({ kind: "plus-minus" as const, value }))
      .filter((choice) => isTotalInBounds(calculateResultingTotal(state.currentTotal, card, choice)));
  }

  if (card.rank === "5") {
    return getTargetablePlayers(state, playerId).map((player) => ({
      kind: "target-player" as const,
      targetPlayerId: player.id
    }));
  }

  const fixed = { kind: "fixed" as const };
  return isTotalInBounds(calculateResultingTotal(state.currentTotal, card, fixed)) ? [fixed] : [];
}

export function getLegalActions(state: NinetyNineState, playerId = state.currentPlayerId): LegalNinetyNineAction[] {
  if (state.phase === "finished" || !playerId) return [];
  const player = state.players.find((item) => item.id === playerId);
  if (!player || player.status !== "playing") return [];

  const hand = state.hands[playerId] ?? [];
  return hand.flatMap((card) =>
    getLegalChoicesForCard(state, playerId, card).map((choice) => ({
      type: "PLAY_CARD" as const,
      playerId,
      cardId: card.id,
      choice,
      resultingTotal: calculateResultingTotal(state.currentTotal, card, choice),
      effectLabel: describeChoice(card, choice)
    }))
  );
}

export function isLegalAction(state: NinetyNineState, action: NinetyNineAction) {
  return getLegalActions(state, action.playerId).some((legal) => (
    legal.cardId === action.cardId && choicesEqual(legal.choice, action.choice)
  ));
}

export function calculateResultingTotal(total: number, card: Card, choice: NinetyNinePlayChoice): number {
  if (card.rank === "10" || card.rank === "Q") {
    if (choice.kind !== "plus-minus") throw new Error(`${card.rank} requires plus-minus choice.`);
    return total + choice.value;
  }

  if (card.rank === "K") return NINETY_NINE_MAX_TOTAL;
  if (card.rank === "4" || card.rank === "5" || card.rank === "J") return total;
  if (choice.kind !== "fixed") throw new Error(`${card.rank} requires fixed choice.`);
  return total + (normalRankValues[card.rank] ?? 0);
}

export function isTotalInBounds(total: number) {
  return total >= NINETY_NINE_MIN_TOTAL && total <= NINETY_NINE_MAX_TOTAL;
}

export function getTargetablePlayers(state: NinetyNineState, playerId: string) {
  return state.players.filter((player) => player.status === "playing" && player.id !== playerId);
}

export function describeChoice(card: Card, choice: NinetyNinePlayChoice) {
  if (card.rank === "10" || card.rank === "Q") return choice.kind === "plus-minus" && choice.value > 0 ? `+${choice.value}` : `${choice.kind === "plus-minus" ? choice.value : ""}`;
  if (card.rank === "5") return "指定下一位";
  return getCardEffect(card).label;
}

export function choicesEqual(left: NinetyNinePlayChoice, right: NinetyNinePlayChoice) {
  if (left.kind !== right.kind) return false;
  if (left.kind === "plus-minus" && right.kind === "plus-minus") return left.value === right.value;
  if (left.kind === "target-player" && right.kind === "target-player") return left.targetPlayerId === right.targetPlayerId;
  return true;
}

