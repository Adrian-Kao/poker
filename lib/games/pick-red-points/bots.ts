import type { Card, Rank } from "../core/cards";
import { getMatchingTableCards, getPickRedCaptureGain, playPickRedHandCard, selectPickRedCaptureTarget } from "./engine";
import type { BotDifficulty, PickRedPointsState, TableCard } from "./types";

/** 依目前階段與難度替指定電腦玩家選擇合法動作，並回傳動作後的新狀態。 */
export function choosePickRedBotAction(state: PickRedPointsState, playerId: string, _difficulty: BotDifficulty = "normal", now = Date.now()): PickRedPointsState {
  const hand = state.hands[playerId] ?? [];
  if (state.phase === "selecting-hand-target" || state.phase === "selecting-draw-target") {
    const target = chooseBestPickRedTarget(state, playerId);
    return target ? selectPickRedCaptureTarget(state, playerId, target.card.id, state.pendingCard?.source ?? "hand", now, `bot-target-${now}`) : state;
  }
  if (state.phase !== "playing-hand" || state.currentPlayerId !== playerId || !hand.length) return state;
  const card = chooseBestPickRedHandCard(state, playerId);
  return playPickRedHandCard(state, playerId, card.id, now, `bot-play-${now}`);
}

/** 依立即得分、雙紅五布局與無分棄牌順序，選出電腦或逾時代打要出的手牌。 */
export function chooseBestPickRedHandCard(state: PickRedPointsState, playerId: string): Card {
  const hand = state.hands[playerId] ?? [];
  if (!hand.length) throw new Error("CARD_NOT_IN_HAND");
  const forcedBlackFive = getForcedBlackFive(state, playerId, hand);
  if (forcedBlackFive) return forcedBlackFive;
  const lockedPairReleaseCard = getLockedPairReleaseCard(state, hand);
  const shouldProtectSingleRedFive = hasCapturedBothBlackFives(state) && hand.filter((card) => card.rank === "5" && isRed(card)).length === 1;

  const candidates = hand.map((card, handIndex) => {
    const targets = getMatchingTableCards(card, state.tableCards);
    const bestGain = targets.reduce((gain, target) => Math.max(gain, getPickRedCaptureGain(state, playerId, card, target.card)), 0);
    const discardPriority = card.id === lockedPairReleaseCard?.id ? -2 : shouldProtectSingleRedFive && card.rank === "5" && isRed(card) ? 17 : getNoScoreDiscardPriority(state, card);
    return { card, handIndex, bestGain, discardPriority };
  });
  const hasScoringCapture = candidates.some((candidate) => candidate.bestGain > 0);
  return candidates.sort((left, right) => hasScoringCapture
    ? right.bestGain - left.bestGain || left.discardPriority - right.discardPriority || left.handIndex - right.handIndex
    : left.discardPriority - right.discardPriority || left.handIndex - right.handIndex)[0].card;
}

/** 從目前合法桌牌中選出能讓玩家實際增加最多分數的目標。 */
export function chooseBestPickRedTarget(state: PickRedPointsState, playerId: string): TableCard | undefined {
  const pending = state.pendingCard;
  if (!pending) return undefined;
  return state.tableCards
    .filter((target) => state.legalTargetIds.includes(target.card.id))
    .sort((left, right) => getPickRedCaptureGain(state, playerId, pending.card, right.card) - getPickRedCaptureGain(state, playerId, pending.card, left.card) || left.tableOrder - right.tableOrder)[0];
}

function getForcedBlackFive(state: PickRedPointsState, playerId: string, hand: Card[]): Card | undefined {
  const player = state.players.find((item) => item.id === playerId);
  if (state.players.length !== 4 || !player || player.seat < 2) return undefined;
  const redFive = hand.some((card) => card.rank === "5" && isRed(card));
  const blackFive = hand.find((card) => card.rank === "5" && !isRed(card) && state.tableCards.some((target) => target.card.rank === "5" && !isRed(target.card)));
  return redFive ? blackFive : undefined;
}

function getLockedPairReleaseCard(state: PickRedPointsState, hand: Card[]): Card | undefined {
  const appeared = [...state.tableCards.map((item) => item.card), ...Object.values(state.capturedCards).flat()];
  for (let firstIndex = 0; firstIndex < hand.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < hand.length; secondIndex += 1) {
      const first = hand[firstIndex];
      const second = hand[secondIndex];
      if (!isPair(first, second)) continue;
      const relevantRanks = getPairRankGroup(first.rank);
      const ownRelevant = hand.filter((card) => relevantRanks.includes(card.rank));
      const appearedRelevant = appeared.filter((card) => relevantRanks.includes(card.rank));
      const totalCardsInGroup = relevantRanks.length * 4;
      if (ownRelevant.length === 2 && ownRelevant.includes(first) && ownRelevant.includes(second) && ownRelevant.length + appearedRelevant.length === totalCardsInGroup) return first;
    }
  }
  return undefined;
}

function getPairRankGroup(rank: Rank): Rank[] {
  const complements: Partial<Record<Rank, Rank>> = { A: "9", "9": "A", "2": "8", "8": "2", "3": "7", "7": "3", "4": "6", "6": "4", "5": "5" };
  const complement = complements[rank];
  return complement && complement !== rank ? [rank, complement] : [rank];
}

function isPair(first: Card, second: Card) {
  const faces: Rank[] = ["10", "J", "Q", "K"];
  if (faces.includes(first.rank) || faces.includes(second.rank)) return first.rank === second.rank;
  const value = (rank: Rank) => rank === "A" ? 1 : Number(rank);
  return value(first.rank) + value(second.rank) === 10;
}

function hasCapturedBothBlackFives(state: PickRedPointsState) {
  const captured = Object.values(state.capturedCards).flat();
  return captured.some((card) => card.rank === "5" && card.suit === "clubs") && captured.some((card) => card.rank === "5" && card.suit === "spades");
}

function getNoScoreDiscardPriority(state: PickRedPointsState, card: Card): number {
  if (isSafeBlackAfterDoubleRed(state, card)) return -1;
  if (!isRed(card) && card.rank === "8") return 0;
  if (!isRed(card) && card.rank === "7") return 1;
  if (!isRed(card) && card.rank === "6") return 2;
  if (!isRed(card) && card.rank === "5") return 3;
  if (isRed(card) && card.rank === "4") return 4;
  if (isRed(card) && card.rank === "3") return 5;
  if (isRed(card) && card.rank === "2") return 6;
  if (!isRed(card) && ["4", "3", "2"].includes(card.rank)) return 7 + (["4", "3", "2"] as Rank[]).indexOf(card.rank);
  if (isRed(card) && ["5", "6", "7", "8"].includes(card.rank)) return 10 + (["5", "6", "7", "8"] as Rank[]).indexOf(card.rank);
  if (card.rank === "9" && isRed(card)) return 15;
  if (card.rank === "A" && isRed(card)) return 16;
  return 14;
}

function isSafeBlackAfterDoubleRed(state: PickRedPointsState, card: Card): boolean {
  if (isRed(card) || !["2", "3", "4", "5", "6", "7", "8", "9"].includes(card.rank)) return false;
  const appeared = [...state.tableCards.map((item) => item.card), ...Object.values(state.capturedCards).flat()];
  return appeared.some((item) => item.rank === card.rank && item.suit === "hearts") && appeared.some((item) => item.rank === card.rank && item.suit === "diamonds");
}

function isRed(card: Card) { return card.suit === "hearts" || card.suit === "diamonds"; }
