import assert from "node:assert/strict";
import test from "node:test";
import { PICK_RED_BOTTOM_CARD_CONFIRM_MS } from "../../lib/games/pick-red-points";
import type { PickRedPointsState } from "../../lib/games/pick-red-points";
import type { PickRedPointsServerEvent } from "../../server/messages/pickRedPointsMessages";
import { PickRedPointsRoomController } from "../../server/rooms/PickRedPointsRoom";
import { ManualRoomScheduler } from "../../server/utilities/scheduler";

test("tail player privately sees the bottom card for five seconds before play starts", () => {
  const scheduler = new ManualRoomScheduler();
  const events: Array<{ event: PickRedPointsServerEvent; playerId?: string }> = [];
  const controller = new PickRedPointsRoomController({
    maxPlayers: 4,
    scheduler,
    random: seeded(1),
    emit: (event, playerId) => events.push({ event, playerId })
  });
  for (let index = 1; index <= 4; index += 1) controller.addHuman(`s${index}`, `玩家${index}`);
  controller.setStartingPlayer("s1", "tail-test-start", "player-s1");

  controller.startGame("s1", "start");

  assert.equal(controller.publicState.phase, "bottom-card-confirmation");
  assert.equal(controller.publicState.lastResult, "尾家確認底牌");
  assert.equal(controller.publicState.turnDeadline, PICK_RED_BOTTOM_CARD_CONFIRM_MS);
  const reveals = events.filter((item) => item.event.type === "BOTTOM_CARD_REVEALED");
  assert.equal(reveals.length, 1);
  assert.equal(reveals[0].playerId, "player-s4");
  assert.throws(() => controller.playHand("s1", "too-early", controller.state!.hands["player-s1"][0].id), /INVALID_PHASE/);

  scheduler.advanceBy(PICK_RED_BOTTOM_CARD_CONFIRM_MS - 1);
  assert.equal(controller.publicState.phase, "bottom-card-confirmation");
  scheduler.advanceBy(1);
  assert.equal(controller.publicState.phase, "playing-hand");
  assert(controller.publicState.turnDeadline > PICK_RED_BOTTOM_CARD_CONFIRM_MS);
  controller.dispose();
});

test("host may toggle a selected starting player and the server uses that player", () => {
  const scheduler = new ManualRoomScheduler();
  const controller = new PickRedPointsRoomController({ maxPlayers: 2, scheduler, random: seeded(4) });
  controller.addHuman("s1", "房主");
  controller.addHuman("s2", "玩家二");

  controller.setStartingPlayer("s1", "select-p2", "player-s2");
  assert.equal(controller.publicState.selectedStartingPlayerId, "player-s2");
  controller.setStartingPlayer("s1", "clear", null);
  assert.equal(controller.publicState.selectedStartingPlayerId, "");
  assert.throws(() => controller.setStartingPlayer("s2", "non-host", "player-s2"), /Only the host/);
  controller.setStartingPlayer("s1", "select-again", "player-s2");
  controller.startGame("s1", "start-selected");

  assert.equal(controller.state?.startingPlayerId, "player-s2");
  assert.equal(controller.state?.currentPlayerId, "player-s2");
  controller.dispose();
});

test("server randomly chooses the starting player when the host leaves it unselected", () => {
  const controller = new PickRedPointsRoomController({ maxPlayers: 2, scheduler: new ManualRoomScheduler(), random: () => 0.99 });
  controller.addHuman("s1", "房主");
  controller.addHuman("s2", "玩家二");
  assert.equal(controller.publicState.selectedStartingPlayerId, "");

  controller.startGame("s1", "random-start");

  assert.equal(controller.state?.startingPlayerId, "player-s2");
  assert.equal(controller.publicState.selectedStartingPlayerId, "player-s2");
  controller.dispose();
});

test("full-round rooms publish one game per player", () => {
  const controller = new PickRedPointsRoomController({ maxPlayers: 3, matchMode: "full-round", random: seeded(9) });
  assert.equal(controller.publicState.matchMode, "full-round");
  assert.equal(controller.publicState.round, 1);
  assert.equal(controller.publicState.totalRounds, 3);
  controller.dispose();
});

test("finished games add threshold-relative match points and expose the five-second next-game deadline", () => {
  const scheduler = new ManualRoomScheduler(10_000);
  const controller = new PickRedPointsRoomController({ maxPlayers: 2, matchMode: "full-round", scheduler, random: seeded(12) });
  controller.addHuman("s1", "玩家一");
  controller.addHuman("s2", "玩家二");
  controller.setStartingPlayer("s1", "choose-p1", "player-s1");
  controller.startGame("s1", "start-series");
  const internal = controller as unknown as { gameState: PickRedPointsState; afterState(): void };
  internal.gameState = { ...controller.state!, phase: "finished", currentPlayerId: null, winners: ["player-s2"], scores: { "player-s1": 90, "player-s2": 120 } };

  internal.afterState();

  assert.equal(Array.from(controller.publicState.players).find((player) => player.id === "player-s1")?.matchPoints, -15);
  assert.equal(Array.from(controller.publicState.players).find((player) => player.id === "player-s2")?.matchPoints, 15);
  assert.equal(controller.publicState.turnDeadline, scheduler.now() + 5_000);
  internal.afterState();
  assert.equal(Array.from(controller.publicState.players).find((player) => player.id === "player-s2")?.matchPoints, 15);
  scheduler.advanceBy(5_000);
  assert.equal(controller.publicState.round, 2);
  assert.equal(controller.state?.startingPlayerId, "player-s2");
  assert.equal(controller.publicState.tailPlayerId, "player-s1");
  controller.dispose();
});

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}
