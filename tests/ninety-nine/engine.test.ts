import assert from "node:assert/strict";
import test from "node:test";
import { createStandardDeck, type Card } from "../../lib/games/core/cards";
import { createSeededRandom, shuffle } from "../../lib/games/core/random";
import {
  applyNinetyNineAction,
  chooseNinetyNineBotAction,
  createNinetyNineGame,
  getLegalActions,
  getNinetyNineWinner,
  isNinetyNineGameFinished,
  recycleDiscardPile,
  type NinetyNineAction,
  type NinetyNineState
} from "../../lib/games/ninety-nine";

const players = [
  { id: "p1", nickname: "阿德" },
  { id: "p2", nickname: "小萱" },
  { id: "p3", nickname: "冠宇" }
];

test("uses one standard 52-card deck without jokers", () => {
  const deck = createStandardDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map((card) => card.id)).size, 52);
  assert(!deck.some((card) => card.rank === ("JOKER" as Card["rank"])));
});

test("seeded shuffle is reproducible", () => {
  const deck = createStandardDeck();
  assert.deepEqual(shuffle(deck, createSeededRandom(99)), shuffle(deck, createSeededRandom(99)));
});

test("createNinetyNineGame deals 5 cards and starts at 0", () => {
  const state = createNinetyNineGame({ players, seed: 7 });
  assert.equal(state.hands.p1.length, 5);
  assert.equal(state.hands.p2.length, 5);
  assert.equal(state.hands.p3.length, 5);
  assert.equal(state.drawPile.length, 37);
  assert.equal(state.currentTotal, 0);
  assert.equal(state.currentPlayerId, "p1");
  assert.equal(state.direction, 1);
});

test("A and normal number cards add platform values", () => {
  assert.equal(applyNinetyNineAction(stateWithHands(10, [["A"], ["3"]]), fixed("p1", "p1-A")).currentTotal, 11);
  assert.equal(applyNinetyNineAction(stateWithHands(10, [["9"], ["3"]]), fixed("p1", "p1-9")).currentTotal, 19);
});

test("4 reverses direction and two-player 4 still moves to the other player", () => {
  const three = applyNinetyNineAction(stateWithHands(44, [["4"], ["2"], ["2"]]), fixed("p1", "p1-4"));
  assert.equal(three.currentTotal, 44);
  assert.equal(three.direction, -1);
  assert.equal(three.currentPlayerId, "p3");

  const two = applyNinetyNineAction(stateWithHands(44, [["4"], ["2"]]), fixed("p1", "p1-4"));
  assert.equal(two.currentPlayerId, "p2");
});

test("5 requires a legal other target", () => {
  const state = stateWithHands(20, [["5"], ["2"], ["2"]]);
  assert.equal(getLegalActions(state).length, 2);
  assert(!getLegalActions(state).some((item) => item.choice.kind === "target-player" && item.choice.targetPlayerId === "p1"));

  const eliminated = { ...state, players: state.players.map((player) => player.id === "p2" ? { ...player, status: "eliminated" as const } : player) };
  assert(!getLegalActions(eliminated).some((item) => item.choice.kind === "target-player" && item.choice.targetPlayerId === "p2"));

  const next = applyNinetyNineAction(state, target("p1", "p1-5", "p3"));
  assert.equal(next.currentPlayerId, "p3");
});

test("10 and Q only expose in-bounds choices", () => {
  assert.deepEqual(getLegalActions(stateWithHands(40, [["10"], ["2"]])).map((item) => item.choice).sort(byJson), [
    { kind: "plus-minus", value: -10 },
    { kind: "plus-minus", value: 10 }
  ].sort(byJson));
  assert.deepEqual(getLegalActions(stateWithHands(5, [["10"], ["2"]])).map((item) => item.choice), [{ kind: "plus-minus", value: 10 }]);
  assert.deepEqual(getLegalActions(stateWithHands(90, [["Q"], ["2"]])).map((item) => item.choice), [{ kind: "plus-minus", value: -20 }]);
});

test("J skips the next player and two-player J returns to actor", () => {
  const three = applyNinetyNineAction(stateWithHands(70, [["J"], ["2"], ["2"]]), fixed("p1", "p1-J"));
  assert.equal(three.currentTotal, 70);
  assert.equal(three.currentPlayerId, "p3");

  const two = applyNinetyNineAction(stateWithHands(70, [["J", "4"], ["2"]]), fixed("p1", "p1-J"));
  assert.equal(two.currentPlayerId, "p1");
});

test("K sets total to 99 and invalid overflow actions are rejected", () => {
  assert.equal(applyNinetyNineAction(stateWithHands(12, [["K"], ["2"]]), fixed("p1", "p1-K")).currentTotal, 99);
  const state = stateWithHands(99, [["9"], ["2"]]);
  assert.equal(getLegalActions(state).length, 0);
  assert.throws(() => applyNinetyNineAction(state, fixed("p1", "p1-9")));
});

test("played cards move to discard and hand draws back to five", () => {
  const state = stateWithHands(10, [["2", "3", "6", "7", "8"], ["3"]], ["9"]);
  const next = applyNinetyNineAction(state, fixed("p1", "p1-2"));
  assert.equal(next.discardPile.at(-1)?.id, "p1-2");
  assert.equal(next.hands.p1.length, 5);
  assert.equal(next.hands.p1.at(-1)?.rank, "9");
});

test("recycle keeps latest public card out of draw pile", () => {
  const state = stateWithHands(10, [["2"], ["3"]]);
  const recycled = recycleDiscardPile({
    ...state,
    drawPile: [],
    discardPile: [card("old-2", "2"), card("old-3", "3"), card("latest-4", "4")]
  }, createSeededRandom(1));
  assert.equal(recycled.discardPile.length, 1);
  assert.equal(recycled.discardPile[0].id, "latest-4");
  assert.equal(recycled.drawPile.length, 2);
});

test("stuck players are eliminated and last active player wins", () => {
  const state = stateWithHands(99, [["K"], ["9"], ["J"]]);
  const next = applyNinetyNineAction(state, fixed("p1", "p1-K"));
  assert.equal(next.players.find((player) => player.id === "p2")?.status, "eliminated");
  assert.equal(next.currentPlayerId, "p3");

  const finish = applyNinetyNineAction(stateWithHands(99, [["K"], ["9"]]), fixed("p1", "p1-K"));
  assert.equal(isNinetyNineGameFinished(finish), true);
  assert.equal(getNinetyNineWinner(finish), "p1");
});

test("non-current player, missing cards and finished games reject actions", () => {
  assert.throws(() => applyNinetyNineAction(stateWithHands(10, [["2"], ["3"]]), fixed("p2", "p2-3")));
  assert.throws(() => applyNinetyNineAction(stateWithHands(10, [["2"], ["3"]]), fixed("p1", "p2-3")));
  const finished = applyNinetyNineAction(stateWithHands(99, [["J"], ["9"]]), fixed("p1", "p1-J"));
  assert.throws(() => applyNinetyNineAction(finished, fixed("p1", "p1-J")));
});

test("bot only chooses legal actions reproducibly", () => {
  const state = stateWithHands(90, [["Q", "9", "5"], ["2"], ["3"]]);
  const randomA = createSeededRandom(10);
  const randomB = createSeededRandom(10);
  const actionA = chooseNinetyNineBotAction(state, "p1", "hard", randomA);
  const actionB = chooseNinetyNineBotAction(state, "p1", "hard", randomB);
  assert(actionA);
  assert.deepEqual(actionA, actionB);
  assert(getLegalActions(state, "p1").some((item) => item.cardId === actionA.cardId && JSON.stringify(item.choice) === JSON.stringify(actionA.choice)));
});

function fixed(playerId: string, cardId: string): NinetyNineAction {
  return { type: "PLAY_CARD", playerId, cardId, choice: { kind: "fixed" } };
}

function target(playerId: string, cardId: string, targetPlayerId: string): NinetyNineAction {
  return { type: "PLAY_CARD", playerId, cardId, choice: { kind: "target-player", targetPlayerId } };
}

function stateWithHands(total: number, ranksByPlayer: string[][], drawRanks: string[] = []): NinetyNineState {
  const activePlayers = players.slice(0, ranksByPlayer.length);
  const hands = Object.fromEntries(
    activePlayers.map((player, playerIndex) => [
      player.id,
      ranksByPlayer[playerIndex].map((rank) => card(`${player.id}-${rank}`, rank))
    ])
  );

  return {
    phase: "playing",
    players: activePlayers.map((player, seat) => ({ ...player, seat, type: "human", status: "playing", connected: true })),
    hands,
    drawPile: drawRanks.map((rank, index) => card(`deck-${index}-${rank}`, rank)),
    discardPile: [],
    currentTotal: total,
    currentPlayerId: activePlayers[0].id,
    direction: 1,
    lastAction: null,
    eliminatedPlayerId: null,
    winnerId: null,
    turnNumber: 1
  };
}

function card(id: string, rank: string): Card {
  return { id, rank: rank as Card["rank"], suit: "clubs" };
}

function byJson(left: unknown, right: unknown) {
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}
