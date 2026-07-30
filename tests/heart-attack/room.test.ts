import assert from "node:assert/strict";
import test from "node:test";
import { HeartAttackRoomController } from "../../server/rooms/HeartAttackRoom";
import { ManualRoomScheduler } from "../../server/utilities/scheduler";
import type { HeartAttackCard, HeartAttackState } from "../../lib/games/heart-attack";
import type { HeartAttackServerEvent } from "../../server/messages/heartAttackMessages";

test("controller keeps joined humans unready and bots ready in the waiting room", () => {
  const controller = new HeartAttackRoomController({ roomCode: "123456" });

  controller.addHuman("s1", "阿德");
  controller.addHuman("s2", "小米");
  controller.addBot("bot-1", "normal");

  assert.equal(controller.publicState.roomCode, "123456");
  assert.equal(controller.publicState.phase, "waiting");
  assert.equal(controller.publicState.players.length, 3);
  assert.deepEqual(Array.from(controller.publicState.players).map((player) => player.ready), [false, false, true]);
});

test("controller auto-starts only after every joined player is ready", () => {
  const scheduler = new ManualRoomScheduler(1000);
  const events: HeartAttackServerEvent[] = [];
  const controller = new HeartAttackRoomController({ scheduler, emit: (event) => events.push(event), roomCode: "123456" });

  controller.addHuman("s1", "阿德");
  controller.addHuman("s2", "小米");
  controller.addHuman("s3", "怡君");
  controller.setReady("s1", "ready-1", true);
  controller.setReady("s2", "ready-2", true);

  assert.equal(controller.publicState.phase, "waiting");

  controller.setReady("s3", "ready-3", true);

  assert.equal(controller.publicState.phase, "playing");
  assert.equal(controller.publicState.players.length, 3);
  assert.equal(controller.state?.nextAutoPlayAt, 1800);
  assert.equal(events.at(-1)?.type, "GAME_STARTED");
  assert.equal(scheduler.activeTaskCount(), 1);
});

test("manual start rejects when not every joined player is ready", () => {
  const controller = new HeartAttackRoomController();
  controller.addHuman("s1", "阿德");
  controller.addHuman("s2", "小米");
  controller.addHuman("s3", "怡君");
  controller.setReady("s1", "ready-1", true);
  controller.setReady("s2", "ready-2", true);

  assert.throws(() => controller.startGame("start-1"), /ready/);
  assert.equal(controller.publicState.phase, "waiting");
});

test("auto-play tick flips one private top card and publishes only public state", () => {
  const { controller, scheduler, events } = startedController();
  const state = requireState(controller.state);
  state.callNumber = 7;
  state.nextAutoPlayAt = 1800;
  state.playerDecks["player-s1"] = [card("8"), card("2")];

  scheduler.advanceBy(800);

  assert.equal(controller.state?.centerPile.length, 1);
  assert.equal(controller.publicState.centerPileCount, 1);
  assert.equal(controller.publicState.lastCard.rank, "8");
  assert.equal(events.some((event) => event.type === "CARD_PLAYED"), true);
  assert.equal("playerDecks" in controller.publicState, false);
});

test("triggered auto-play keeps autoplay scheduled without a prompt", () => {
  const { controller, scheduler, events } = startedController();
  const state = requireState(controller.state);
  state.callNumber = 7;
  state.nextAutoPlayAt = 1800;
  state.playerDecks["player-s1"] = [card("7"), card("2")];

  scheduler.advanceBy(800);
  assert.equal(controller.state?.phase, "playing");
  assert.equal(controller.state?.nextAutoPlayAt, 2600);
  assert.equal(events.some((event) => event.type === "SLAP_WINDOW_OPENED"), false);

  scheduler.advanceBy(100);
  controller.slap("s2", "slap-s2");
  scheduler.advanceBy(200);
  controller.slap("s3", "slap-s3");
  scheduler.advanceBy(1200);

  assert.equal(controller.state?.phase, "round-result");
  assert.equal(controller.state?.penaltyResult?.reason, "slowest-slap");
  assert.equal(controller.state?.penaltyResult?.playerId, "player-s3");
  assert.equal(controller.publicState.penaltyNotice.playerId, "player-s3");
  assert.equal(events.some((event) => event.type === "PENALTY_NOTICE"), true);
});

test("round-result rejects new slap and resumes after notice window", () => {
  const { controller, scheduler } = startedController();
  const state = requireState(controller.state);
  state.callNumber = 7;
  state.nextAutoPlayAt = 1800;
  state.playerDecks["player-s1"] = [card("8"), card("2")];

  scheduler.advanceBy(800);
  controller.slap("s2", "false-slap");
  assert.equal(controller.state?.phase, "round-result");
  assert.throws(() => controller.slap("s3", "late-slap"), /Cannot slap now/);

  scheduler.advanceBy(5000);
  assert.equal(controller.state?.phase, "playing");
  assert.equal(controller.publicState.penaltyNotice.playerId, "");
});

test("duplicate actionId is rejected", () => {
  const { controller } = startedController();
  controller.slap("s1", "dup");
  assert.throws(() => controller.slap("s1", "dup"), /Duplicate actionId/);
});

test("bot slap timers are cancelled on dispose", () => {
  const scheduler = new ManualRoomScheduler(1000);
  const controller = new HeartAttackRoomController({ scheduler, random: () => 0.5 });
  controller.addHuman("s1", "阿德");
  controller.addHuman("s2", "小米");
  controller.addBot("bot-1", "hard");
  controller.setReady("s1", "ready-1", true);
  controller.setReady("s2", "ready-2", true);
  const state = requireState(controller.state);
  state.callNumber = 7;
  state.nextAutoPlayAt = 1800;
  state.playerDecks["player-s1"] = [card("7"), card("2")];

  scheduler.advanceBy(800);
  assert.equal(controller.state?.phase, "playing");
  assert(scheduler.activeTaskCount() >= 1);

  controller.dispose();
  assert.equal(scheduler.activeTaskCount(), 0);
});

function startedController() {
  const scheduler = new ManualRoomScheduler(1000);
  const events: HeartAttackServerEvent[] = [];
  const controller = new HeartAttackRoomController({ scheduler, emit: (event) => events.push(event) });
  controller.addHuman("s1", "阿德");
  controller.addHuman("s2", "小米");
  controller.addHuman("s3", "怡君");
  controller.setReady("s1", "ready-1", true);
  controller.setReady("s2", "ready-2", true);
  controller.setReady("s3", "ready-3", true);
  return { controller, scheduler, events };
}

function requireState(state: HeartAttackState | null): HeartAttackState {
  if (!state) throw new Error("Expected started game.");
  return state;
}

function card(rank: HeartAttackCard["rank"]): HeartAttackCard {
  return {
    id: `test-${rank}-${Math.random()}`,
    deckIndex: 1,
    suit: rank === "JOKER" ? null : "clubs",
    rank
  };
}

