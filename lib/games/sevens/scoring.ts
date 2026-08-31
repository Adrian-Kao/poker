import { SEVENS_RANK_VALUE } from "./constants";
import type { SevensCard, SevensStanding, SevensState } from "./types";

export function calculateClassicScore(cards: readonly SevensCard[]) {
  return cards.reduce((total, card) => total + SEVENS_RANK_VALUE[card.rank], 0);
}

export function calculateStandings(state: SevensState): SevensStanding[] {
  const order = getFixedTurnOrder(state);
  const standings = state.players.map((player) => {
    const covered = state.coveredCards[player.id] ?? [];
    return {
      playerId: player.id,
      nickname: player.nickname,
      rank: 0,
      coveredCount: covered.length,
      coveredPoints: calculateClassicScore(covered),
      turnOrderIndex: order.indexOf(player.id),
      finishOrderIndex: state.finishOrder.indexOf(player.id)
    };
  });
  standings.sort((left, right) => {
    if (left.coveredPoints !== right.coveredPoints) return (left.coveredPoints ?? 0) - (right.coveredPoints ?? 0);
    return left.coveredCount - right.coveredCount || left.finishOrderIndex - right.finishOrderIndex || left.turnOrderIndex - right.turnOrderIndex;
  });
  return standings.map((standing, index) => ({ ...standing, rank: index + 1 }));
}

export function getSevensWinner(state: SevensState) {
  return (state.standings ?? calculateStandings(state))[0]?.playerId ?? null;
}

export function getFixedTurnOrder(state: SevensState) {
  const players = [...state.players].sort((left, right) => left.seat - right.seat);
  const startIndex = players.findIndex((player) => player.id === state.startingPlayerId);
  const direction = state.direction === "clockwise" ? 1 : -1;
  return players.map((_, offset) => {
    const index = (startIndex + offset * direction + players.length) % players.length;
    return players[index].id;
  });
}
