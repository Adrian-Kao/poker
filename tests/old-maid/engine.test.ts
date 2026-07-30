import assert from "node:assert/strict";
import test from "node:test";
import {
  applyOldMaidAction,
  createOldMaidDeck,
  createOldMaidGame,
  createOldMaidOpeningSetup,
  dealOldMaidCards,
  removeOldMaidPairs,
  type OldMaidCard,
  type OldMaidDrawAction,
  type OldMaidState
} from "../../lib/games/old-maid";
import { createSeededRandom } from "../../lib/games/core/random";

const players = [
  { id: "p1", nickname: "阿德" },
  { id: "p2", nickname: "小美" },
  { id: "p3", nickname: "大明" },
  { id: "p4", nickname: "小花" }
];

test("deck has 54 unique cards and dealing starts after the dealer", () => {
  const deck = createOldMaidDeck(createSeededRandom(1));
  assert.equal(deck.length, 54);
  assert.equal(new Set(deck.map((card) => card.id)).size, 54);
  assert.equal(deck.filter((card) => card.rank === "JOKER").length, 2);

  const hands = dealOldMaidCards(deck, players, "p1");
  assert.deepEqual(players.map((player) => hands[player.id].length), [13, 14, 14, 13]);
  assert.equal(hands.p2[0].id, deck[0].id);
});

test("pairs remove by rank while both jokers stay unpaired", () => {
  const result = removeOldMaidPairs([
    card("7a", "7"),
    card("7b", "7"),
    card("7c", "7"),
    card("7d", "7"),
    card("ka", "K"),
    card("kb", "K"),
    card("kc", "K"),
    card("aa", "A"),
    card("ab", "A"),
    card("joker-1", "JOKER"),
    card("joker-2", "JOKER")
  ], "p1");

  assert.deepEqual(result.pairs.map((pair) => pair.rank).sort(), ["7", "7", "A", "K"]);
  assert.deepEqual(result.hand.map((item) => item.id), ["kc", "joker-1", "joker-2"]);
});

test("game creation is reproducible, removes initial pairs and prepares one shared display order", () => {
  const state = createOldMaidGame({ players, seed: 12 });
  assert.deepEqual(state, createOldMaidGame({ players, seed: 12 }));

  const cardTotal = Object.values(state.hands).reduce((sum, hand) => sum + hand.length, 0)
    + state.removedPairs.length * 2;
  assert.equal(cardTotal, 54);
  assert.equal(Object.values(state.hands).flat().filter((card) => card.rank === "JOKER").length, 2);
  Object.values(state.hands).forEach((hand) => {
    const ranks = hand.filter((card) => card.rank !== "JOKER").map((card) => card.rank);
    assert.equal(new Set(ranks).size, ranks.length);
  });

  assert.equal(state.phase, "playing");
  assert(state.targetPlayerId);
  assert.deepEqual(
    state.drawLayout?.slots.map((slot) => slot.cardId),
    state.hands[state.targetPlayerId].map((card) => card.id)
  );
});

test("opening setup preserves all 54 dealt cards and exposes deterministic pair rounds", () => {
  const setup = createOldMaidOpeningSetup({ players, seed: 12 });
  assert.deepEqual(setup, createOldMaidOpeningSetup({ players, seed: 12 }));

  const dealtCards = Object.values(setup.dealtHands).flat();
  assert.equal(dealtCards.length, 54);
  assert.equal(new Set(dealtCards.map((card) => card.id)).size, 54);

  const scheduledPairs = players.flatMap(
    (player) => setup.pairsByPlayer[player.id] ?? []
  );
  assert.deepEqual(scheduledPairs, setup.state.removedPairs);

  players.forEach((player) => {
    const removedIds = new Set(
      (setup.pairsByPlayer[player.id] ?? [])
        .flatMap((pair) => pair.cards.map((card) => card.id))
    );
    const organizedIds = setup.dealtHands[player.id]
      .filter((card) => !removedIds.has(card.id))
      .map((card) => card.id)
      .sort();
    assert.deepEqual(
      organizedIds,
      setup.state.hands[player.id].map((card) => card.id).sort()
    );
  });

  const jokers = dealtCards.filter((card) => card.rank === "JOKER");
  assert.equal(jokers.length, 2);
  assert(
    scheduledPairs.every((pair) => pair.cards.every((card) => card.rank !== "JOKER"))
  );
});

test("drawing moves the selected card, removes a new pair and advances clockwise", () => {
  const state = stateWithHands({
    p1: [card("p1-a", "A")],
    p2: [card("p2-a", "A"), card("p2-q", "Q")],
    p3: [card("p3-k", "K"), card("joker-1", "JOKER"), card("joker-2", "JOKER")]
  }, "p1", "p2");
  const next = applyOldMaidAction(state, action(state, "slot-a"), createSeededRandom(3));

  assert.equal(next.lastAction?.card.id, "p2-a");
  assert.deepEqual(next.lastAction?.removedPairs.map((pair) => pair.rank), ["A"]);
  assert.equal(next.hands.p1.length, 0);
  assert.deepEqual(next.hands.p2.map((item) => item.id), ["p2-q"]);
  assert.equal(next.players.find((player) => player.id === "p1")?.status, "safe");
  assert.equal(next.currentPlayerId, "p2");
  assert.equal(next.targetPlayerId, "p3");
  assert.deepEqual(
    next.drawLayout?.slots.map((slot) => slot.cardId),
    next.hands.p3.map((item) => item.id)
  );
});

test("safe players are skipped when choosing the next player and target", () => {
  const state = stateWithHands({
    p1: [card("p1-2", "2")],
    p2: [],
    p3: [card("p3-3", "3"), card("p3-4", "4"), card("joker-1", "JOKER"), card("joker-2", "JOKER")]
  }, "p1", "p3");
  const next = applyOldMaidAction(state, action(state, "slot-a"), createSeededRandom(4));

  assert.equal(next.currentPlayerId, "p3");
  assert.equal(next.targetPlayerId, "p1");
});

test("the last player must finish with both jokers and becomes the loser", () => {
  const state = stateWithHands({
    p1: [card("p1-a", "A")],
    p2: [card("p2-a", "A")],
    p3: [card("joker-1", "JOKER"), card("joker-2", "JOKER")]
  }, "p1", "p2");
  const next = applyOldMaidAction(state, action(state, "slot-a"), createSeededRandom(5));

  assert.equal(next.phase, "finished");
  assert.equal(next.loserId, "p3");
  assert.equal(next.currentPlayerId, null);
  assert.equal(next.targetPlayerId, null);
  assert.deepEqual(next.hands.p3.map((item) => item.rank), ["JOKER", "JOKER"]);
  assert.equal(next.players.find((player) => player.id === "p3")?.status, "loser");
});

test("invalid players, targets, turns and card slots are rejected", () => {
  const state = stateWithHands({
    p1: [card("p1-2", "2")],
    p2: [card("p2-3", "3"), card("p2-4", "4")],
    p3: [card("p3-5", "5"), card("joker-1", "JOKER"), card("joker-2", "JOKER")]
  }, "p1", "p2");
  const valid = action(state, "slot-a");

  assert.throws(() => applyOldMaidAction(state, { ...valid, playerId: "p2" }), /turn/);
  assert.throws(() => applyOldMaidAction(state, { ...valid, targetPlayerId: "p3" }), /target/);
  assert.throws(() => applyOldMaidAction(state, { ...valid, turnNumber: 0 }), /Stale/);
  assert.throws(() => applyOldMaidAction(state, { ...valid, cardSlotId: "missing" }), /slot/);

  const next = applyOldMaidAction(state, valid, createSeededRandom(6));
  assert.throws(() => applyOldMaidAction(next, valid), /Stale|turn/);
});

test("game creation rejects invalid player counts and duplicate ids", () => {
  assert.throws(() => createOldMaidGame({ players: players.slice(0, 2), seed: 1 }), /3 to 6/);
  assert.throws(() => createOldMaidGame({
    players: [players[0], players[0], players[1]],
    seed: 1
  }), /unique/);
});

function stateWithHands(
  hands: Record<string, OldMaidCard[]>,
  currentPlayerId: string,
  targetPlayerId: string
): OldMaidState {
  const gamePlayers = players.slice(0, 3).map((player, seat) => ({
    ...player,
    seat,
    status: hands[player.id].length === 0 ? "safe" as const : "playing" as const
  }));
  const slots = hands[targetPlayerId].map((item, index) => ({
    cardSlotId: `slot-${String.fromCharCode(97 + index)}`,
    cardId: item.id
  }));

  return {
    phase: "playing",
    players: gamePlayers,
    hands,
    dealerPlayerId: "p3",
    currentPlayerId,
    targetPlayerId,
    turnNumber: 1,
    drawLayout: { turnNumber: 1, targetPlayerId, slots },
    removedPairs: [],
    finishOrder: gamePlayers.filter((player) => player.status === "safe").map((player) => player.id),
    loserId: null,
    lastAction: null
  };
}

function action(state: OldMaidState, cardSlotId: string): OldMaidDrawAction {
  assert(state.currentPlayerId);
  assert(state.targetPlayerId);
  return {
    type: "DRAW_CARD",
    playerId: state.currentPlayerId,
    targetPlayerId: state.targetPlayerId,
    turnNumber: state.turnNumber,
    cardSlotId
  };
}

function card(id: string, rank: OldMaidCard["rank"]): OldMaidCard {
  return rank === "JOKER"
    ? { id, rank, suit: null }
    : { id, rank, suit: "clubs" };
}
