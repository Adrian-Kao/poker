import assert from "node:assert/strict";
import test from "node:test";
import {
  createBluffGame,
  playBluffCards,
  resolveAllTrust,
  resolveRoundResult,
  submitBluffReaction,
  type BluffCard,
  type BluffState
} from "../../lib/games/bluff";

const players = [
  { id: "p1", nickname: "阿德" },
  { id: "p2", nickname: "小美" },
  { id: "p3", nickname: "大明" }
];

test("createBluffGame deals a 54-card deck including jokers", () => {
  const state = createBluffGame({ players, seed: 7 });
  const totalCards = Object.values(state.hands).reduce((sum, hand) => sum + hand.length, 0);
  assert.equal(totalCards, 54);
  assert.equal(state.players.length, 3);
  assert.equal(state.currentPlayerId, "p1");
});

test("challenge makes the liar collect the center pile", () => {
  const state = stateWithHands([["7"], ["Q"], ["3"]]);
  const claimed = playBluffCards(state, "p1", ["p1-7"], "Q", 100);
  const resolved = submitBluffReaction(claimed, "p2", "challenge", "challenge-1", 120);

  assert.equal(resolved.phase, "round-result");
  assert.equal(resolved.roundResult?.isLie, true);
  assert.equal(resolved.roundResult?.penaltyPlayerId, "p1");
  assert.equal(resolved.roundResult?.message, "抓到了齁");
  assert.equal(resolved.hands.p1.length, 1);
  assert.equal(resolved.centerPile.length, 0);
});

test("joker counts as the called rank during challenge", () => {
  const state = stateWithHands([[["p1-joker", "JOKER"]], ["Q"], ["3"]]);
  const claimed = playBluffCards(state, "p1", ["p1-joker"], "Q", 100);
  const resolved = submitBluffReaction(claimed, "p2", "challenge", "challenge-1", 120);

  assert.equal(resolved.roundResult?.isLie, false);
  assert.equal(resolved.roundResult?.penaltyPlayerId, "p2");
  assert.equal(resolved.roundResult?.message, "說好的信任呢");
  assert.equal(resolved.hands.p2.length, 2);
});

test("only the first play of a pile sets the called rank", () => {
  const state = stateWithHands([["Q"], ["2"], ["3"]]);
  const first = playBluffCards(state, "p1", ["p1-Q"], "Q", 100);
  const secondTurn = resolveAllTrust(first, 200);
  const second = playBluffCards(secondTurn, "p2", ["p2-2"], "K", 300);

  assert.equal(second.roundClaimRank, "Q");
  assert.equal(second.batches.at(-1)?.claimedRank, "Q");
});

test("correct challenge makes the challenger start the next pile", () => {
  const state = stateWithHands([["7", "8"], ["Q"], ["3"]]);
  const claimed = playBluffCards(state, "p1", ["p1-7"], "Q", 100);
  const challenged = submitBluffReaction(claimed, "p2", "challenge", "challenge-1", 120);
  const nextRound = resolveRoundResult(challenged, 2200);

  assert.equal(challenged.roundResult?.isLie, true);
  assert.equal(challenged.roundResult?.penaltyPlayerId, "p1");
  assert.equal(nextRound.phase, "playing");
  assert.equal(nextRound.currentPlayerId, "p2");
  assert.equal(nextRound.roundClaimRank, null);
});

test("wrong challenge makes the challenged player start the next pile", () => {
  const state = stateWithHands([["Q", "8"], ["2"], ["3"]]);
  const claimed = playBluffCards(state, "p1", ["p1-Q"], "Q", 100);
  const challenged = submitBluffReaction(claimed, "p2", "challenge", "challenge-1", 120);
  const nextRound = resolveRoundResult(challenged, 2200);

  assert.equal(challenged.roundResult?.isLie, false);
  assert.equal(challenged.roundResult?.penaltyPlayerId, "p2");
  assert.equal(nextRound.phase, "playing");
  assert.equal(nextRound.currentPlayerId, "p1");
  assert.equal(nextRound.roundClaimRank, null);
});

test("player with no hand must survive a full turn before winning", () => {
  const state = stateWithHands([["Q"], ["2"], ["3"]]);
  const claimed = playBluffCards(state, "p1", ["p1-Q"], "Q", 100);
  assert.equal(claimed.players.find((player) => player.id === "p1")?.status, "pendingFinish");

  const p2Turn = resolveAllTrust(claimed, 200);
  assert.equal(p2Turn.currentPlayerId, "p2");
  assert.equal(p2Turn.players.find((player) => player.id === "p1")?.status, "pendingFinish");

  const p2Claim = playBluffCards(p2Turn, "p2", ["p2-2"], "2", 300);
  const p3Turn = resolveAllTrust(p2Claim, 400);
  const p3Claim = playBluffCards(p3Turn, "p3", ["p3-3"], "3", 500);
  const afterFullRound = resolveAllTrust(p3Claim, 600);

  assert.equal(afterFullRound.players.find((player) => player.id === "p1")?.status, "winner");
  assert.equal(afterFullRound.winnerId, "p1");
});

function stateWithHands(rankRows: (string | [string, BluffCard["rank"]])[][]): BluffState {
  const hands = Object.fromEntries(
    players.map((player, playerIndex) => [
      player.id,
      rankRows[playerIndex].map((rankOrTuple) => {
        if (Array.isArray(rankOrTuple)) return card(rankOrTuple[0], rankOrTuple[1]);
        return card(`${player.id}-${rankOrTuple}`, rankOrTuple as BluffCard["rank"]);
      })
    ])
  );

  return {
    phase: "playing",
    players: players.map((player, seat) => ({ ...player, seat, type: "human", status: "playing", connected: true })),
    hands,
    centerPile: [],
    discardPile: [],
    batches: [],
    roundClaimRank: null,
    roundClaimCount: 0,
    currentPlayerId: "p1",
    lastBatchId: null,
    reactions: [],
    reactionStartedAt: null,
    reactionDeadline: null,
    reviewerId: null,
    roundResult: null,
    winnerId: null,
    turnNumber: 1
  };
}

function card(id: string, rank: BluffCard["rank"]): BluffCard {
  return { id, rank, suit: rank === "JOKER" ? null : "clubs" };
}
