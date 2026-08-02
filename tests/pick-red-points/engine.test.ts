import assert from "node:assert/strict";
import test from "node:test";
import { createPickRedPointsGame, getPickRedDealCount, isValidPickRedPair, playPickRedHandCard, selectPickRedCaptureTarget } from "../../lib/games/pick-red-points";
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
