import assert from "node:assert/strict";
import test from "node:test";
import { createStandardDeck, type Card } from "../../lib/games/core/cards";
import { createSeededRandom, shuffle } from "../../lib/games/core/random";
import {
  applyNinetyNineAction,
  createNinetyNineGame,
  getLegalActions,
  getNinetyNineWinner,
  isNinetyNineGameFinished,
  type NinetyNineState
} from "../../lib/games/ninety-nine";

const players = [
  { id: "p1", nickname: "阿德" },
  { id: "p2", nickname: "小萱" },
  { id: "p3", nickname: "冠宇" }
];

test("creates a standard 52-card deck with unique ids", () => {
  const deck = createStandardDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map((card) => card.id)).size, 52);
});

test("seeded shuffle is reproducible", () => {
  const deck = createStandardDeck();
  assert.deepEqual(shuffle(deck, createSeededRandom(99)), shuffle(deck, createSeededRandom(99)));
});

test("createNinetyNineGame deals 5 cards to each player", () => {
  const state = createNinetyNineGame({ players, seed: 7 });
  assert.equal(state.hands.p1.length, 5);
  assert.equal(state.hands.p2.length, 5);
  assert.equal(state.hands.p3.length, 5);
  assert.equal(state.deck.length, 37);
});

test("new game starts at total 0 with the first player", () => {
  const state = createNinetyNineGame({ players, seed: 7 });
  assert.equal(state.phase, "playing");
  assert.equal(state.total, 0);
  assert.equal(state.currentPlayerId, "p1");
  assert.equal(state.direction, 1);
});

test("normal number cards add their face value", () => {
  const state = stateWithHands(10, [["2"], ["3"]]);
  const next = applyNinetyNineAction(state, action("p1", "p1-2"));
  assert.equal(next.total, 12);
});

test("A can choose 11 when it does not exceed 99", () => {
  const state = stateWithHands(80, [["A"], ["2"]]);
  const legal = getLegalActions(state);
  assert(legal.some((item) => item.effectChoice === 11 && item.resultingTotal === 91));
});

test("A cannot choose a value that exceeds 99", () => {
  const state = stateWithHands(95, [["A"], ["2"]]);
  const legal = getLegalActions(state);
  assert(legal.some((item) => item.effectChoice === 1));
  assert(!legal.some((item) => item.effectChoice === 11));
});

test("4 reverses direction without changing total", () => {
  const state = stateWithHands(44, [["4"], ["2"], ["2"]]);
  const next = applyNinetyNineAction(state, action("p1", "p1-4"));
  assert.equal(next.total, 44);
  assert.equal(next.direction, -1);
  assert.equal(next.currentPlayerId, "p3");
});

test("5 requires a target player", () => {
  const state = stateWithHands(20, [["5"], ["2"], ["2"]]);
  assert.equal(getLegalActions(state).length, 2);
  assert.throws(() => applyNinetyNineAction(state, action("p1", "p1-5")));
});

test("5 cannot target the acting player", () => {
  const state = stateWithHands(20, [["5"], ["2"], ["2"]]);
  assert(!getLegalActions(state).some((item) => item.targetPlayerId === "p1"));
});

test("5 cannot target an eliminated player", () => {
  const state = stateWithHands(20, [["5"], ["2"], ["2"]]);
  const eliminated = { ...state, players: state.players.map((player) => (player.id === "p2" ? { ...player, eliminated: true } : player)) };
  assert(!getLegalActions(eliminated).some((item) => item.targetPlayerId === "p2"));
});

test("5 sends the turn to the chosen player", () => {
  const state = stateWithHands(20, [["5"], ["2"], ["2"]]);
  const next = applyNinetyNineAction(state, { ...action("p1", "p1-5"), targetPlayerId: "p3" });
  assert.equal(next.currentPlayerId, "p3");
});

test("10 can choose +10 or -10", () => {
  const state = stateWithHands(40, [["10"], ["2"]]);
  const choices = getLegalActions(state).map((item) => item.effectChoice).sort();
  assert.deepEqual(choices, [-10, 10]);
});

test("10 cannot make the total negative", () => {
  const state = stateWithHands(5, [["10"], ["2"]]);
  assert.deepEqual(getLegalActions(state).map((item) => item.effectChoice), [10]);
});

test("Q can choose +20 or -20", () => {
  const state = stateWithHands(40, [["Q"], ["2"]]);
  const choices = getLegalActions(state).map((item) => item.effectChoice).sort();
  assert.deepEqual(choices, [-20, 20]);
});

test("Q cannot exceed 99", () => {
  const state = stateWithHands(90, [["Q"], ["2"]]);
  assert.deepEqual(getLegalActions(state).map((item) => item.effectChoice), [-20]);
});

test("J passes without changing total", () => {
  const state = stateWithHands(70, [["J"], ["2"]]);
  const next = applyNinetyNineAction(state, action("p1", "p1-J"));
  assert.equal(next.total, 70);
});

test("K sets total to 99", () => {
  const state = stateWithHands(12, [["K"], ["2"]]);
  const next = applyNinetyNineAction(state, action("p1", "p1-K"));
  assert.equal(next.total, 99);
});

test("illegal action is rejected", () => {
  const state = stateWithHands(99, [["9"], ["2"]]);
  assert.equal(getLegalActions(state).length, 0);
  assert.throws(() => applyNinetyNineAction(state, action("p1", "p1-9")));
});

test("non-current player cannot act", () => {
  const state = stateWithHands(10, [["2"], ["3"]]);
  assert.throws(() => applyNinetyNineAction(state, action("p2", "p2-3")));
});

test("a player cannot play a card they do not hold", () => {
  const state = stateWithHands(10, [["2"], ["3"]]);
  assert.throws(() => applyNinetyNineAction(state, action("p1", "p2-3")));
});

test("played cards move to discard and the hand draws back to 5 when possible", () => {
  const state = stateWithHands(10, [["2", "3", "6", "7", "8"], ["3"]], ["9"]);
  const next = applyNinetyNineAction(state, action("p1", "p1-2"));
  assert.equal(next.discardPile.at(-1)?.id, "p1-2");
  assert.equal(next.hands.p1.length, 5);
  assert.equal(next.hands.p1.at(-1)?.rank, "9");
});

test("next player with no legal action is eliminated", () => {
  const state = stateWithHands(99, [["J"], ["9"], ["J"]]);
  const next = applyNinetyNineAction(state, action("p1", "p1-J"));
  assert.equal(next.players.find((player) => player.id === "p2")?.eliminated, true);
  assert.equal(next.currentPlayerId, "p3");
});

test("game finishes when one player remains", () => {
  const state = stateWithHands(99, [["J"], ["9"]]);
  const next = applyNinetyNineAction(state, action("p1", "p1-J"));
  assert.equal(isNinetyNineGameFinished(next), true);
  assert.equal(getNinetyNineWinner(next), "p1");
});

test("finished games reject additional actions", () => {
  const state = stateWithHands(99, [["J"], ["9"]]);
  const next = applyNinetyNineAction(state, action("p1", "p1-J"));
  assert.throws(() => applyNinetyNineAction(next, action("p1", "p1-J")));
});

test("action log records play, elimination, and finish", () => {
  const state = stateWithHands(99, [["J"], ["9"]]);
  const next = applyNinetyNineAction(state, action("p1", "p1-J"));
  assert(next.actionLog.some((entry) => entry.type === "CARD_PLAYED"));
  assert(next.actionLog.some((entry) => entry.type === "PLAYER_ELIMINATED"));
  assert(next.actionLog.some((entry) => entry.type === "GAME_FINISHED"));
});

function action(playerId: string, cardId: string) {
  return { type: "PLAY_CARD" as const, playerId, cardId };
}

function stateWithHands(total: number, ranksByPlayer: string[][], deckRanks: string[] = []): NinetyNineState {
  const activePlayers = players.slice(0, ranksByPlayer.length);
  const hands = Object.fromEntries(
    activePlayers.map((player, playerIndex) => [
      player.id,
      ranksByPlayer[playerIndex].map((rank) => card(`${player.id}-${rank}`, rank))
    ])
  );

  return {
    phase: "playing",
    players: activePlayers.map((player) => ({ ...player, eliminated: false })),
    hands,
    deck: deckRanks.map((rank, index) => card(`deck-${index}-${rank}`, rank)),
    discardPile: [],
    total,
    currentPlayerId: activePlayers[0].id,
    direction: 1,
    winnerId: null,
    turnNumber: 1,
    actionLog: []
  };
}

function card(id: string, rank: string): Card {
  return {
    id,
    rank: rank as Card["rank"],
    suit: "clubs"
  };
}
