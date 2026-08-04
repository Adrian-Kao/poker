import assert from "node:assert/strict";
import test from "node:test";
import { createStandardDeck, type Card, type Rank, type Suit } from "../lib/games/core/cards";
import { BigTwoRuleError, classifyCombination, compareCombinations, dealBigTwoCards, ensureThreeOfClubsIsDealt, isThirteenRankDragon, passTurn, playCards, type BigTwoState } from "../lib/games/big-two";

const card = (rank: Rank, suit: Suit = "clubs"): Card => ({ id: `${suit}-${rank}`, rank, suit });

test("standard deck has 52 unique cards and no joker", () => {
  const deck = createStandardDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map((item) => item.id)).size, 52);
});

test("three player deal gives the three of clubs holder the covered bonus card", () => {
  const deck = createStandardDeck();
  const result = dealBigTwoCards(deck, ["a", "b", "c"]);
  const holder = Object.keys(result.hands).find((id) => result.hands[id].some((item) => item.id === "clubs-3"));
  assert.equal(result.bonusCardRecipientId, holder);
  assert.deepEqual(Object.values(result.hands).map((hand) => hand.length).sort((a, b) => a - b), [17, 17, 18]);
});

test("three of clubs is swapped out of the covered bonus position", () => {
  const deck = createStandardDeck().filter((item) => item.id !== "clubs-3");
  deck.push(card("3"));
  const fixed = ensureThreeOfClubsIsDealt(deck, 3);
  assert.notEqual(fixed.at(-1)?.id, "clubs-3");
  assert.equal(fixed.at(-2)?.id, "clubs-3");
});

test("classifies all supported combinations", () => {
  assert.equal(classifyCombination([card("3")])?.type, "single");
  assert.equal(classifyCombination([card("9"), card("9", "spades")])?.type, "pair");
  assert.equal(classifyCombination([card("3"), card("4", "diamonds"), card("5", "hearts"), card("6", "spades"), card("7")])?.type, "straight");
  assert.equal(classifyCombination([card("Q"), card("Q", "diamonds"), card("Q", "hearts"), card("6"), card("6", "spades")])?.type, "full-house");
  assert.equal(classifyCombination([card("7"), card("7", "diamonds"), card("7", "hearts"), card("7", "spades"), card("K")])?.type, "four-of-a-kind");
  assert.equal(classifyCombination([card("8", "spades"), card("9", "spades"), card("10", "spades"), card("J", "spades"), card("Q", "spades")])?.type, "straight-flush");
});

test("rejects unsupported triples, two-pair, flushes, and K-A-2-3-4", () => {
  assert.equal(classifyCombination([card("8"), card("8", "diamonds"), card("8", "hearts")]), null);
  assert.equal(classifyCombination([card("3"), card("3", "diamonds"), card("4"), card("4", "diamonds"), card("K")]), null);
  assert.equal(classifyCombination([card("3", "hearts"), card("5", "hearts"), card("8", "hearts"), card("J", "hearts"), card("K", "hearts")]), null);
  assert.equal(classifyCombination([card("K"), card("A", "diamonds"), card("2", "hearts"), card("3", "spades"), card("4")]), null);
});

test("Q-K-A-2-3 is the largest straight", () => {
  const largest = classifyCombination([card("Q"), card("K", "diamonds"), card("A", "hearts"), card("2", "spades"), card("3")]);
  const previous = classifyCombination([card("J"), card("Q", "diamonds"), card("K", "hearts"), card("A", "spades"), card("2")]);
  assert.ok(largest && previous && compareCombinations(largest, previous) > 0);
});

test("four of a kind cuts ordinary plays and straight flush cuts four of a kind", () => {
  const pair = classifyCombination([card("A"), card("A", "spades")]);
  const four = classifyCombination([card("3"), card("3", "diamonds"), card("3", "hearts"), card("3", "spades"), card("4")]);
  const straightFlush = classifyCombination([card("4", "hearts"), card("5", "hearts"), card("6", "hearts"), card("7", "hearts"), card("8", "hearts")]);
  assert.ok(pair && four && straightFlush);
  assert.ok(compareCombinations(four, pair) > 0);
  assert.ok(compareCombinations(straightFlush, four) > 0);
  assert.ok(compareCombinations(four, straightFlush) < 0);
});

test("first play must contain the three of clubs and lead cannot pass", () => {
  const state = sampleState();
  assert.throws(() => playCards(state, "a", ["clubs-4"], 10, "bad"), (error) => error instanceof BigTwoRuleError && error.code === "MUST_INCLUDE_THREE_OF_CLUBS");
  assert.throws(() => passTurn(state, "a", 10, "pass"), (error) => error instanceof BigTwoRuleError && error.code === "CANNOT_PASS_ON_LEAD");
});

test("all other players passing resets the trick to its last player", () => {
  let state = playCards(sampleState(), "a", ["clubs-3"], 10, "play-a");
  state = passTurn(state, "b", 11, "pass-b");
  state = passTurn(state, "c", 12, "pass-c");
  assert.equal(state.currentPlayerId, "a");
  assert.equal(state.lastPlay, null);
  assert.deepEqual(state.passedPlayerIds, []);
});

test("thirteen distinct ranks form the four-player opening dragon", () => {
  assert.equal(isThirteenRankDragon(["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"].map((rank) => card(rank as Rank))), true);
});

function sampleState(): BigTwoState {
  return { phase: "playing", playerCount: 3, players: ["a", "b", "c"].map((id, seat) => ({ id, nickname: id, seat, type: "human", status: "playing", connected: true, plays: 0, passes: 0 })), hands: { a: [card("3"), card("4")], b: [card("5")], c: [card("6")] }, bonusCardRecipientId: "a", openingRevealCards: {}, currentPlayerId: "a", trickLeaderId: "a", lastPlay: null, playHistory: [], passedPlayerIds: [], firstTurnPending: true, turnNumber: 1, winnerIds: [], winReason: null, actionIds: [] };
}
