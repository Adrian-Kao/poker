import assert from "node:assert/strict";
import test from "node:test";
import { calculatePickRedCardScore, calculatePickRedScores, choosePickRedBotAction, createPickRedPointsGame, finalizePickRedScores, getPickRedDealCount, getPickRedWinners, getPickRedWinningScore, isAllBlackPickRedHand, isValidPickRedPair, keepPickRedBlackHand, playPickRedHandCard, requestPickRedBlackHandReshuffle, selectPickRedCaptureTarget } from "../../lib/games/pick-red-points";
import type { Card } from "../../lib/games/core/cards";

const players = [{ id: "p1", nickname: "阿德" }, { id: "p2", nickname: "小美" }];
const card = (id: string, rank: Card["rank"], suit: Card["suit"] = "clubs"): Card => ({ id, rank, suit });

test("creates a 52-card game with 12 cards each, four table cards and 24 draw cards", () => {
  const state = createPickRedPointsGame({ players, random: () => 0.5 });
  assert.equal(Object.values(state.hands).reduce((total, hand) => total + hand.length, 0), 24);
  assert.equal(state.hands.p1.length, 12);
  assert.equal(state.hands.p2.length, 12);
  assert.equal(state.tableCards.length, 4);
  assert.equal(state.drawPile.length, 24);
  assert.equal(new Set([...state.hands.p1, ...state.hands.p2, ...state.tableCards.map((item) => item.card), ...state.drawPile].map((item) => item.id)).size, 52);
});

test("uses the platform deal count for two, three and four players", () => {
  assert.equal(getPickRedDealCount(2), 12);
  assert.equal(getPickRedDealCount(3), 8);
  assert.equal(getPickRedDealCount(4), 6);
});

test("matches number pairs to ten and face cards only to themselves", () => {
  assert.equal(isValidPickRedPair(card("a", "A"), card("9", "9")), true);
  assert.equal(isValidPickRedPair(card("2", "2"), card("8", "8")), true);
  assert.equal(isValidPickRedPair(card("10", "10"), card("j", "J")), false);
  assert.equal(isValidPickRedPair(card("q1", "Q"), card("q2", "Q", "hearts")), true);
});

test("requires selecting one target and captures exactly one table card", () => {
  const state = createPickRedPointsGame({ players, random: () => 0.2 });
  const custom = { ...state, hands: { p1: [card("hand-3", "3")], p2: state.hands.p2 }, tableCards: [{ card: card("table-7a", "7", "hearts"), enteredAtTurn: 0, tableOrder: 0 }, { card: card("table-7b", "7", "clubs"), enteredAtTurn: 0, tableOrder: 1 }], currentPlayerId: "p1" as string };
  const selected = playPickRedHandCard(custom, "p1", "hand-3", 100, "play-1");
  assert.equal(selected.phase, "selecting-hand-target");
  assert.equal(selected.legalTargetIds.length, 2);
  const captured = selectPickRedCaptureTarget(selected, "p1", "table-7a", "hand", 200, "target-1");
  assert.equal(captured.capturedCards.p1.length, 2);
  assert.equal(captured.tableCards.length, 2);
});

test("two-player and three-player games score only red cards", () => {
  assert.equal(calculatePickRedCardScore(card("sa", "A", "spades"), 2), 0);
  assert.equal(calculatePickRedCardScore(card("ca", "A", "clubs"), 3), 0);
  assert.equal(calculatePickRedCardScore(card("ha", "A", "hearts"), 2), 20);
  assert.equal(calculatePickRedCardScore(card("d7", "7", "diamonds"), 3), 7);
  assert.equal(calculatePickRedCardScore(card("h9", "9", "hearts"), 2), 10);
  assert.equal(calculatePickRedCardScore(card("dk", "K", "diamonds"), 3), 10);
});

test("four-player games score the ace of spades but no other black cards", () => {
  assert.equal(calculatePickRedCardScore(card("sa", "A", "spades"), 4), 10);
  assert.equal(calculatePickRedCardScore(card("ca", "A", "clubs"), 4), 0);
  assert.equal(calculatePickRedCardScore(card("s10", "10", "spades"), 4), 0);
  assert.equal(calculatePickRedCardScore(card("ck", "K", "clubs"), 4), 0);
});

test("four-player double red five gives 40 points when every opponent can pay 10", () => {
  const scores = calculatePickRedScores({
    p1: [card("h5", "5", "hearts"), card("d5", "5", "diamonds")],
    p2: [card("ha", "A", "hearts")],
    p3: [card("da", "A", "diamonds")],
    p4: [card("sa", "A", "spades")]
  }, ["p1", "p2", "p3", "p4"]);
  assert.deepEqual(scores, { p1: 40, p2: 10, p3: 10, p4: 0 });
});

test("double red five only takes the points each opponent can afford", () => {
  const scores = calculatePickRedScores({
    p1: [card("h5", "5", "hearts"), card("d5", "5", "diamonds")],
    p2: [card("h7", "7", "hearts")],
    p3: [card("d3", "3", "diamonds")],
    p4: []
  }, ["p1", "p2", "p3", "p4"]);
  assert.deepEqual(scores, { p1: 20, p2: 0, p3: 0, p4: 0 });
});

test("red fives captured in separate pairs do not count as double red five", () => {
  const scores = calculatePickRedScores({
    p1: [card("h5", "5", "hearts"), card("c5", "5", "clubs"), card("d5", "5", "diamonds"), card("s5", "5", "spades")],
    p2: [], p3: [], p4: []
  }, ["p1", "p2", "p3", "p4"]);
  assert.deepEqual(scores, { p1: 10, p2: 0, p3: 0, p4: 0 });
});

test("winning thresholds depend on player count", () => {
  assert.equal(getPickRedWinningScore(2), 105);
  assert.equal(getPickRedWinningScore(3), 70);
  assert.equal(getPickRedWinningScore(4), 55);
});

test("players reaching the player-count threshold win", () => {
  const state = createPickRedPointsGame({ players: [players[0], players[1], { id: "p3", nickname: "小明" }], random: () => 0.5 });
  const scored = {
    ...state,
    capturedCards: {
      p1: [card("ha1", "A", "hearts"), card("ha2", "A", "diamonds"), card("hk1", "K", "hearts"), card("hk2", "K", "diamonds"), card("hq1", "Q", "hearts"), card("hq2", "Q", "diamonds")],
      p2: [card("h2", "2", "hearts")],
      p3: [card("d2", "2", "diamonds")]
    }
  };
  assert.deepEqual(getPickRedWinners(scored), ["p1"]);
});

test("a natural zero score reverses every other player's final score", () => {
  const result = finalizePickRedScores({
    p1: [card("ha", "A", "hearts"), card("da", "A", "diamonds"), card("hk", "K", "hearts"), card("dk", "K", "diamonds"), card("h10", "10", "hearts")],
    p2: [card("h8a", "8", "hearts"), card("d8a", "8", "diamonds"), card("h8b", "8", "hearts"), card("d8b", "8", "diamonds"), card("h8c", "8", "hearts")],
    p3: []
  }, ["p1", "p2", "p3"]);
  assert.deepEqual(result.noScorePlayerIds, ["p3"]);
  assert.deepEqual(result.scores, { p1: -70, p2: -40, p3: 0 });
});

test("a natural zero player pays nothing for double red five and still triggers reversal", () => {
  const result = finalizePickRedScores({
    p1: [card("h5", "5", "hearts"), card("d5", "5", "diamonds")],
    p2: [card("ha", "A", "hearts"), card("hk", "K", "hearts")],
    p3: [card("da", "A", "diamonds"), card("dk", "K", "diamonds")],
    p4: []
  }, ["p1", "p2", "p3", "p4"]);
  assert.deepEqual(result.noScorePlayerIds, ["p4"]);
  assert.deepEqual(result.scores, { p1: -30, p2: -20, p3: -20, p4: 0 });
});

test("all-black hand eligibility follows player-count rules", () => {
  assert.equal(isAllBlackPickRedHand([card("sa", "A", "spades"), card("c2", "2", "clubs")], 2), true);
  assert.equal(isAllBlackPickRedHand([card("sa", "A", "spades"), card("c2", "2", "clubs")], 4), false);
  assert.equal(isAllBlackPickRedHand([card("s2", "2", "spades"), card("ck", "K", "clubs")], 4), true);
  assert.equal(isAllBlackPickRedHand([card("h2", "2", "hearts"), card("ck", "K", "clubs")], 3), false);
});

test("eligible player may keep an all-black hand", () => {
  const state = createPickRedPointsGame({ players, random: () => 0.5 });
  const custom = { ...state, phase: "black-hand-decision" as const, blackHandEligiblePlayerIds: ["p1"], blackHandPendingPlayerIds: ["p1"] };
  const kept = keepPickRedBlackHand(custom, "p1", "keep-1");
  assert.equal(kept.phase, "playing-hand");
  assert.deepEqual(kept.blackHandPendingPlayerIds, []);
});

test("eligible reshuffle request reveals that player's complete hand", () => {
  const state = createPickRedPointsGame({ players, random: () => 0.5 });
  const custom = { ...state, phase: "black-hand-decision" as const, hands: { ...state.hands, p1: [card("s2", "2", "spades"), card("c3", "3", "clubs")] }, blackHandEligiblePlayerIds: ["p1"], blackHandPendingPlayerIds: ["p1"] };
  const revealed = requestPickRedBlackHandReshuffle(custom, "p1", "shuffle-1");
  assert.equal(revealed.phase, "black-hand-reveal");
  assert.equal(revealed.revealedBlackHandPlayerId, "p1");
  assert.deepEqual(revealed.revealedBlackHandCards, custom.hands.p1);
});

test("two, three and four player games finish with every hand empty", () => {
  for (const playerCount of [2, 3, 4]) {
    let state = createPickRedPointsGame({
      players: Array.from({ length: playerCount }, (_, index) => ({ id: `sim-${index}`, nickname: `玩家${index + 1}`, type: "bot" as const })),
      random: () => 0.37
    });
    if (state.phase === "black-hand-decision") state = { ...state, phase: "playing-hand", blackHandPendingPlayerIds: [] };

    for (let step = 0; state.phase !== "finished" && step < 200; step += 1) {
      state = choosePickRedBotAction(state, state.currentPlayerId ?? "", "normal", step + 1);
    }

    assert.equal(state.phase, "finished", `${playerCount} 人局應正常結束`);
    assert.deepEqual(Object.values(state.hands).map((hand) => hand.length), Array(playerCount).fill(0));
    assert.equal(state.drawPile.length, 0);
  }
});
