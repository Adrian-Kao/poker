import type { Card, Rank } from "../core/cards";
import type { LegalNinetyNineAction, NinetyNineAction, NinetyNineEffectChoice, NinetyNineState } from "./types";

const normalRankValues: Partial<Record<Rank, number>> = {
  "2": 2,
  "3": 3,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9
};

export function getCardEffectChoices(card: Card): Array<NinetyNineEffectChoice | undefined> {
  if (card.rank === "A") return [1, 11];
  if (card.rank === "10") return [10, -10];
  if (card.rank === "Q") return [20, -20];
  return [undefined];
}

export function calculateResultingTotal(total: number, card: Card, effectChoice?: NinetyNineEffectChoice): number {
  if (card.rank === "A") {
    requireChoice(card, effectChoice, [1, 11]);
    return total + effectChoice;
  }

  if (card.rank === "10") {
    requireChoice(card, effectChoice, [10, -10]);
    return total + effectChoice;
  }

  if (card.rank === "Q") {
    requireChoice(card, effectChoice, [20, -20]);
    return total + effectChoice;
  }

  if (card.rank === "K") return 99;
  if (card.rank === "4" || card.rank === "5" || card.rank === "J") return total;

  return total + (normalRankValues[card.rank] ?? 0);
}

export function isTotalInBounds(total: number) {
  return total >= 0 && total <= 99;
}

export function isActionStructurallyLegal(state: NinetyNineState, action: NinetyNineAction): boolean {
  return getLegalActions(state, action.playerId).some((legalAction) => {
    return (
      legalAction.cardId === action.cardId &&
      legalAction.effectChoice === action.effectChoice &&
      legalAction.targetPlayerId === action.targetPlayerId
    );
  });
}

export function getLegalActions(state: NinetyNineState, playerId = state.currentPlayerId): LegalNinetyNineAction[] {
  if (state.phase !== "playing" || !playerId || playerId !== state.currentPlayerId) return [];

  const player = state.players.find((item) => item.id === playerId);
  if (!player || player.eliminated) return [];

  const hand = state.hands[playerId] ?? [];
  const actions: LegalNinetyNineAction[] = [];

  for (const card of hand) {
    for (const effectChoice of getCardEffectChoices(card)) {
      const resultingTotal = calculateResultingTotal(state.total, card, effectChoice);
      if (!isTotalInBounds(resultingTotal)) continue;

      if (card.rank === "5") {
        for (const target of getTargetablePlayers(state, playerId)) {
          actions.push({
            type: "PLAY_CARD",
            playerId,
            cardId: card.id,
            targetPlayerId: target.id,
            resultingTotal
          });
        }
        continue;
      }

      actions.push({
        type: "PLAY_CARD",
        playerId,
        cardId: card.id,
        effectChoice,
        resultingTotal
      });
    }
  }

  return actions;
}

export function getTargetablePlayers(state: NinetyNineState, playerId: string) {
  return state.players.filter((player) => !player.eliminated && player.id !== playerId);
}

function requireChoice(
  card: Card,
  effectChoice: NinetyNineEffectChoice | undefined,
  allowed: NinetyNineEffectChoice[]
): asserts effectChoice is NinetyNineEffectChoice {
  if (!allowed.includes(effectChoice as NinetyNineEffectChoice)) {
    throw new Error(`${card.rank} requires one of these choices: ${allowed.join(", ")}`);
  }
}
