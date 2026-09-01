import type { Card } from "../core/cards";

/** 依遊戲人數與牌面規則計算單張牌的基礎分數。 */
export function calculatePickRedCardScore(card: Card, playerCount: number): number {
  if (card.suit === "hearts" || card.suit === "diamonds") {
    if (card.rank === "A") return 20;
    if (["2", "3", "4", "5", "6", "7", "8"].includes(card.rank)) return Number(card.rank);
    return 10;
  }
  if (playerCount === 4 && card.suit === "spades" && card.rank === "A") return 10;
  return 0;
}

/** 加總玩家所有已吃牌的基礎分數，不包含雙紅五轉帳與零分逆轉。 */
export function calculatePickRedPlayerScore(cards: Card[], playerCount: number): number {
  return cards.reduce((total, card) => total + calculatePickRedCardScore(card, playerCount), 0);
}

/** 計算牌局進行中的牌面基礎分，不提前套用雙紅五轉帳。 */
export function calculatePickRedBaseScores(capturedCards: Record<string, Card[]>, playerIds: string[]): Record<string, number> {
  const playerCount = playerIds.length;
  return Object.fromEntries(playerIds.map((playerId) => [playerId, calculatePickRedPlayerScore(capturedCards[playerId] ?? [], playerCount)]));
}

/** 判斷同一次配對取得的兩張牌是否都是紅色 5。 */
export function isDoubleRedFiveCapture(first: Card, second: Card): boolean {
  return first.rank === "5" && second.rank === "5" && isRed(first) && isRed(second);
}

/** 計算牌局進行中的分數，包含四人局雙紅五的實際支付，但不執行零分逆轉。 */
export function calculatePickRedScores(capturedCards: Record<string, Card[]>, playerIds: string[]): Record<string, number> {
  const playerCount = playerIds.length;
  const scores = calculatePickRedBaseScores(capturedCards, playerIds);

  if (playerCount !== 4) return scores;

  for (const capturerId of playerIds) {
    const cards = capturedCards[capturerId] ?? [];
    for (let index = 0; index + 1 < cards.length; index += 2) {
      if (!isDoubleRedFiveCapture(cards[index], cards[index + 1])) continue;
      for (const playerId of playerIds) {
        if (playerId === capturerId) continue;
        const payment = Math.min(10, Math.max(0, scores[playerId]));
        scores[playerId] -= payment;
        scores[capturerId] += payment;
      }
    }
  }

  return scores;
}

/** 計算雙紅五的帳面待結算分；支付能力只在牌局結束時判定。 */
export function calculatePickRedScoreAdjustments(capturedCards: Record<string, Card[]>, playerIds: string[]): Record<string, number> {
  const adjustments = Object.fromEntries(playerIds.map((playerId) => [playerId, 0]));
  if (playerIds.length !== 4) return adjustments;

  for (const capturerId of playerIds) {
    const cards = capturedCards[capturerId] ?? [];
    for (let index = 0; index + 1 < cards.length; index += 2) {
      if (!isDoubleRedFiveCapture(cards[index], cards[index + 1])) continue;
      adjustments[capturerId] += 30;
      for (const playerId of playerIds) {
        if (playerId !== capturerId) adjustments[playerId] -= 10;
      }
    }
  }

  return adjustments;
}

/** 完成最終結算；若有人基礎分為零，保留零分者分數並反轉其他玩家分數。 */
export function finalizePickRedScores(capturedCards: Record<string, Card[]>, playerIds: string[]): {
  scores: Record<string, number>;
  noScorePlayerIds: string[];
} {
  const playerCount = playerIds.length;
  const scores = calculatePickRedScores(capturedCards, playerIds);
  const noScorePlayerIds = playerIds.filter(
    (playerId) => calculatePickRedPlayerScore(capturedCards[playerId] ?? [], playerCount) === 0
  );

  if (!noScorePlayerIds.length) return { scores, noScorePlayerIds };

  const noScorePlayers = new Set(noScorePlayerIds);
  return {
    scores: Object.fromEntries(
      playerIds.map((playerId) => [playerId, noScorePlayers.has(playerId) ? scores[playerId] : scores[playerId] * -1])
    ),
    noScorePlayerIds
  };
}

/** 取得二、三、四人局各自的獲勝分數門檻。 */
export function getPickRedWinningScore(playerCount: number): number {
  if (playerCount === 2) return 105;
  if (playerCount === 3) return 70;
  if (playerCount === 4) return 55;
  throw new Error("Player count must be 2, 3 or 4.");
}

/** 判斷牌的花色是否為紅心或方塊。 */
function isRed(card: Card): boolean {
  return card.suit === "hearts" || card.suit === "diamonds";
}
