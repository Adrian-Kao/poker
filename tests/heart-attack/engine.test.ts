import assert from "node:assert/strict";
import test from "node:test";
import { createSeededRandom } from "../../lib/games/core/random";
import {
  AUTO_PLAY_INTERVAL_MS,
  advanceAutoPlay,
  applyHeartAttackAction,
  buildHeartAttackDeck,
  calculateBotReaction,
  createHeartAttackGame,
  getCalledRankValue,
  getAutoPlayIntervalMs,
  getHeartAttackWinner,
  getNextCallNumber,
  getNextPlayablePlayer,
  isSlapTrigger,
  PENALTY_ALERT_MS,
  resolveRoundResult,
  resolveSlapWindow,
  ROUND_RESULT_DISPLAY_MS,
  submitSlap,
  type HeartAttackCard,
  type HeartAttackState
} from "../../lib/games/heart-attack";

const players = [
  { id: "p1", nickname: "阿德" },
  { id: "p2", nickname: "小萱" },
  { id: "p3", nickname: "冠宇" }
];

test("builds enough 54-card decks for player count", () => {
  assert.equal(buildHeartAttackDeck(3, createSeededRandom(1)).length, 90);
  assert.equal(buildHeartAttackDeck(6, createSeededRandom(1)).length, 180);
});

test("heart attack cards have unique ids after multi-deck build", () => {
  const deck = buildHeartAttackDeck(8, createSeededRandom(2));
  assert.equal(new Set(deck.map((item) => item.id)).size, deck.length);
});

test("deck includes jokers", () => {
  assert(buildHeartAttackDeck(3, createSeededRandom(3)).some((item) => item.rank === "JOKER"));
});

test("createHeartAttackGame deals 30 cards and schedules autoplay", () => {
  const state = createHeartAttackGame({ players, seed: 4, initialTimestamp: 100 });
  assert.equal(state.playerDecks.p1.length, 30);
  assert.equal(state.playerDecks.p2.length, 30);
  assert.equal(state.playerDecks.p3.length, 30);
  assert.equal(state.nextAutoPlayAt, 100 + AUTO_PLAY_INTERVAL_MS);
  assert.equal(state.penaltyResult, null);
});

test("requires at least 3 players", () => {
  assert.throws(() => createHeartAttackGame({ players: players.slice(0, 2), seed: 1 }));
});

test("rejects duplicate player ids", () => {
  assert.throws(() => createHeartAttackGame({ players: [players[0], players[0], players[1]], seed: 1 }));
});

test("call number cycles from 1 to 13", () => {
  assert.equal(getNextCallNumber(1), 2);
  assert.equal(getNextCallNumber(13), 1);
});

test("face cards map to called numbers", () => {
  assert.equal(getCalledRankValue(card("A")), 1);
  assert.equal(getCalledRankValue(card("J")), 11);
  assert.equal(getCalledRankValue(card("Q")), 12);
  assert.equal(getCalledRankValue(card("K")), 13);
});

test("joker is never a slap trigger by call number", () => {
  assert.equal(getCalledRankValue({ id: "joker", deckIndex: 1, suit: null, rank: "JOKER" }), null);
});

test("autoplay does nothing before scheduled time", () => {
  const state = stateWithDecks(7, [["8"], ["2"], ["3"]], 1000);
  assert.equal(advanceAutoPlay(state, 1799).centerPile.length, 0);
});

test("AUTO_PLAY_TICK flips exactly one card when due", () => {
  const state = stateWithDecks(7, [["8"], ["2"], ["3"]], 1000);
  const next = applyHeartAttackAction(state, { type: "AUTO_PLAY_TICK", timestamp: 1800 });
  assert.equal(next.centerPile.length, 1);
  assert.equal(next.currentPlayerId, "p2");
});

test("autoplay interval speeds up every 6 played cards down to 0.45 seconds", () => {
  assert.equal(getAutoPlayIntervalMs(1), 800);
  assert.equal(getAutoPlayIntervalMs(7), 750);
  assert.equal(getAutoPlayIntervalMs(13), 700);
  assert.equal(getAutoPlayIntervalMs(43), 450);
  assert.equal(getAutoPlayIntervalMs(60), 450);
});

test("matching auto-played card opens a slap window without pausing autoplay", () => {
  const next = advanceAutoPlay(stateWithDecks(7, [["7"], ["2"], ["3"]], 1000), 1800);
  assert.equal(next.phase, "playing");
  assert.equal(next.slapDeadline, 2600);
  assert.equal(next.nextAutoPlayAt, 2600);
});

test("non-matching auto-played card schedules next auto play", () => {
  const next = advanceAutoPlay(stateWithDecks(7, [["8"], ["2"], ["3"]], 1000), 1800);
  assert.equal(next.phase, "playing");
  assert.equal(next.nextAutoPlayAt, 2600);
});

test("player action only supports SLAP", () => {
  const state = stateWithDecks(7, [["8"], ["2"], ["3"]], 1000);
  assert.throws(() => applyHeartAttackAction(state, { type: "PLAY_TOP_CARD", playerId: "p1", timestamp: 1800 } as never));
});

test("valid slap is recorded until the slap window resolves", () => {
  const state = advanceAutoPlay(stateWithDecks(7, [["7"], ["2"], ["3"]], 1000), 1800);
  const next = submitSlap(state, "p2", 1800);
  assert.equal(next.phase, "playing");
  assert.equal(next.slapResponses.length, 1);
  assert.equal(next.nextAutoPlayAt, 2600);
});

test("slowest valid slapper receives the center pile penalty", () => {
  let state = advanceAutoPlay(stateWithDecks(7, [["7"], ["2"], ["3"]], 1000), 1800);
  state = submitSlap(state, "p2", 1800);
  state = submitSlap(state, "p3", 2000);
  const next = resolveSlapWindow(state, 2600);
  assert.equal(next.roundResult?.reason, "slowest-slap");
  assert.equal(next.roundResult?.penaltyPlayerId, "p3");
  assert.equal(next.penaltyResult?.reason, "slowest-slap");
  assert.equal(next.penaltyResult?.playerId, "p3");
  assert.equal(next.penaltyResult?.cardsTaken, 1);
  assert.deepEqual(next.penaltyResult?.cardIds, ["deck-1-clubs-7"]);
  assert.equal(next.penaltyResult?.responseTimeMs, 200);
  assert.equal(next.nextAutoPlayAt, 2600 + PENALTY_ALERT_MS);
});

test("false slap collects center pile as penalty", () => {
  const state = advanceAutoPlay(stateWithDecks(7, [["8"], ["2"], ["3"]], 1000), 1800);
  const next = submitSlap(state, "p2", 1800);
  assert.equal(next.roundResult?.reason, "false-slap");
  assert.equal(next.roundResult?.penaltyPlayerId, "p2");
  assert.equal(next.penaltyResult?.reason, "false-slap");
  assert.equal(next.penaltyResult?.playerName, players[1].nickname);
  assert.equal(next.penaltyResult?.cardsTaken, 1);
  assert.equal(next.nextAutoPlayAt, 1800 + ROUND_RESULT_DISPLAY_MS);
});

test("late slap is treated as false slap", () => {
  const state = advanceAutoPlay(stateWithDecks(7, [["7"], ["2"], ["3"]], 1000), 1800);
  const next = submitSlap(state, "p2", 2601);
  assert.equal(next.roundResult?.reason, "false-slap");
});

test("missed slap window clears and continues without collecting cards", () => {
  const state = advanceAutoPlay(stateWithDecks(7, [["7", "8"], ["2"], ["3"]], 1000), 1800);
  const next = resolveSlapWindow(state, 2600);
  assert.equal(next.roundResult, null);
  assert.equal(next.penaltyResult, null);
  assert.equal(next.centerPile.length, 1);
  assert.equal(next.slapDeadline, null);
  assert.equal(next.nextAutoPlayAt, 2600);
});

test("missed slap window can resolve and immediately continue autoplay", () => {
  const state = advanceAutoPlay(stateWithDecks(7, [["7"], ["2"], ["3"]], 1000), 1800);
  const resolved = resolveSlapWindow(state, 2600);
  const next = advanceAutoPlay(resolved, 2600);
  assert.equal(next.centerPile.length, 2);
  assert.equal(next.centerPile.at(-1)?.calledNumber, 8);
});

test("round-result does not auto-play until display time passes", () => {
  const state = submitSlap(advanceAutoPlay(stateWithDecks(7, [["7", "8"], ["2"], ["3"]], 1000), 1800), "p2", 1800);
  const result = resolveSlapWindow(state, 2600);
  assert.equal(advanceAutoPlay(result, 7599).phase, "round-result");
});

test("round-result resumes autoplay after display time", () => {
  const state = submitSlap(advanceAutoPlay(stateWithDecks(7, [["7", "8"], ["2"], ["3"]], 1000), 1800), "p2", 1800);
  const result = resolveSlapWindow(state, 2600);
  const next = resolveRoundResult(result, 7600);
  assert.equal(next.phase, "playing");
  assert.equal(next.penaltyResult, null);
  assert.equal(next.nextAutoPlayAt, 8400);
});

test("round-result ignores additional slap input", () => {
  const state = submitSlap(advanceAutoPlay(stateWithDecks(7, [["8"], ["2"], ["3"]], 1000), 1800), "p2", 1800);
  assert.equal(submitSlap(state, "p3", 1950), state);
});

test("finished games do not auto-play", () => {
  const state = { ...stateWithDecks(7, [["7"], ["2"], ["3"]], 1000), phase: "finished" as const, nextAutoPlayAt: null };
  assert.equal(advanceAutoPlay(state, 9999), state);
});

test("getNextPlayablePlayer respects seat order", () => {
  const state = stateWithDecks(7, [["8"], ["2"], ["3"]], 1000);
  assert.equal(getNextPlayablePlayer(state, "p1"), "p2");
  assert.equal(getNextPlayablePlayer(state, "p3"), "p1");
});

test("player enters pendingFinish after autoplaying final card", () => {
  const next = advanceAutoPlay(stateWithDecks(7, [["8"], ["2"], ["3"]], 1000), 1800);
  assert.equal(next.players.find((item) => item.id === "p1")?.status, "pendingFinish");
});

test("pendingFinish player wins when autoplay reaches them again", () => {
  let state = advanceAutoPlay(stateWithDecks(7, [["8"], ["2", "4"], ["3", "5"]], 1000), 1800);
  state = advanceAutoPlay(state, 2600);
  state = advanceAutoPlay(state, 3400);
  state = advanceAutoPlay(state, 4200);
  assert.equal(state.phase, "playing");
  assert.equal(getHeartAttackWinner(state), "p1");
  assert.deepEqual(state.winnerIds, ["p1"]);
  assert.equal(state.players.find((item) => item.id === "p1")?.status, "winner");
});

test("pendingFinish trigger continues when nobody slaps", () => {
  const state = {
    ...advanceAutoPlay(stateWithDecks(7, [["7"], ["2"], ["3"]], 1000), 1800),
    players: players.slice(0, 3).map((player, seat) => ({
      ...player,
      seat,
      type: "human" as const,
      status: player.id === "p1" ? "pendingFinish" as const : "playing" as const
    }))
  };
  const next = resolveSlapWindow(state, 2600);
  assert.equal(next.penaltyResult, null);
  assert.equal(next.roundResult, null);
  assert.equal(next.players.find((item) => item.id === "p1")?.status, "pendingFinish");
  assert.equal(next.nextAutoPlayAt, 2600);
});

test("bot reaction can miss a real trigger", () => {
  assert.equal(calculateBotReaction("easy", () => 0.01, true), null);
});

test("bot reaction falls inside difficulty range", () => {
  assert.equal(calculateBotReaction("hard", () => 0.5, true), 500);
});

test("bot can false slap based on chance", () => {
  assert.equal(calculateBotReaction("normal", () => 0.01, false), 555);
});

test("isSlapTrigger compares card rank to called number", () => {
  assert.equal(isSlapTrigger(card("A"), 1), true);
  assert.equal(isSlapTrigger(card("A"), 2), false);
});

test("unknown slapper is rejected", () => {
  const state = advanceAutoPlay(stateWithDecks(7, [["7"], ["2"], ["3"]], 1000), 1800);
  assert.throws(() => submitSlap(state, "ghost", 1800));
});

test("slap validity is based on the latest card's called number, not the next call number", () => {
  const state = advanceAutoPlay(stateWithDecks(7, [["7"], ["2"], ["3"]], 1000), 1800);
  assert.equal(state.callNumber, 8);
  assert.equal(state.centerPile.at(-1)?.calledNumber, 7);

  const next = submitSlap(state, "p2", 1800);
  assert.equal(next.slapResponses.at(-1)?.valid, true);
});

function stateWithDecks(callNumber: number, decks: string[][], now: number): HeartAttackState {
  return {
    phase: "playing",
    players: players.slice(0, decks.length).map((player, seat) => ({ ...player, seat, type: "human", status: "playing" })),
    playerDecks: Object.fromEntries(players.slice(0, decks.length).map((player, index) => [player.id, decks[index].map((rank) => card(rank))])),
    centerPile: [],
    currentPlayerId: "p1",
    callNumber,
    slapResponses: [],
    slapDeadline: null,
    roundResult: null,
    penaltyResult: null,
    winnerId: null,
    winnerIds: [],
    turnNumber: 1,
    autoPlayIntervalMs: AUTO_PLAY_INTERVAL_MS,
    nextAutoPlayAt: now + AUTO_PLAY_INTERVAL_MS,
    isAutoPlayPaused: false
  };
}

function card(rank: string): HeartAttackCard {
  return {
    id: `deck-1-clubs-${rank}`,
    deckIndex: 1,
    suit: rank === "JOKER" ? null : "clubs",
    rank: rank as HeartAttackCard["rank"]
  };
}

