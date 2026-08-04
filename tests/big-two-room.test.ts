import assert from "node:assert/strict";
import test from "node:test";
import { BigTwoRoomController } from "../server/rooms/BigTwoRoom";
import type { BigTwoServerEvent } from "../server/messages/bigTwoMessages";
import { ManualRoomScheduler } from "../server/utilities/scheduler";

test("big two room starts only after every human is ready and sends private hands to owners", () => {
  const events: Array<{ event: BigTwoServerEvent; playerId?: string }> = [];
  const controller = new BigTwoRoomController({
    maxPlayers: 3,
    scheduler: new ManualRoomScheduler(),
    random: seeded(1),
    emit: (event, playerId) => events.push({ event, playerId })
  });

  controller.addHuman("s1", "房主", "tab-host");
  controller.addHuman("s2", "朋友", "tab-friend");
  controller.addBot("s1", "normal");
  controller.setReady("s1", true);
  assert.throws(() => controller.start("s1"), /ready/i);
  controller.setReady("s2", true);
  controller.start("s1");

  assert.equal(controller.publicState.phase, "playing");
  assert.equal(controller.publicState.players.length, 3);
  const privateHands = events.filter((item) => item.event.type === "PRIVATE_HAND");
  assert.deepEqual(privateHands.map((item) => item.playerId).sort(), ["player-s1", "player-s2"]);
  assert(privateHands.every((item) => item.playerId));
  assert(events.some((item) => item.event.type === "GAME_STARTED" && item.playerId === undefined));
  controller.dispose();
});

test("big two room deduplicates a reconnect from the same browser tab", () => {
  const controller = new BigTwoRoomController({ roomCode: "123456", random: seeded(2) });

  controller.addHuman("s1", "阿德", "same-tab");
  controller.addHuman("s2", "阿德", "same-tab");
  controller.addHuman("s3", "朋友", "other-tab");
  controller.setReady("s2", true);

  assert.equal(controller.publicState.players.length, 2);
  assert.equal(controller.publicState.players[0]?.id, "player-s2");
  assert.equal(controller.publicState.players[0]?.ready, true);
  assert.equal(controller.publicState.players[1]?.nickname, "朋友");
  controller.dispose();
});

test("big two room rejects malformed card payloads before the rules engine", () => {
  const controller = readyStartedController();
  const state = controller.state;
  assert(state?.currentPlayerId);
  const sessionId = state.currentPlayerId === "player-s1" ? "s1" : "s2";

  assert.throws(() => controller.play(sessionId, "bad-empty", []), /payload/i);
  assert.throws(() => controller.play(sessionId, "bad-six", ["1", "2", "3", "4", "5", "6"]), /payload/i);
  controller.dispose();
});

function readyStartedController() {
  const controller = new BigTwoRoomController({ maxPlayers: 3, scheduler: new ManualRoomScheduler(), random: seeded(3) });
  controller.addHuman("s1", "阿德", "tab-1");
  controller.addHuman("s2", "小萱", "tab-2");
  controller.addBot("s1", "easy");
  controller.setReady("s1", true);
  controller.setReady("s2", true);
  controller.start("s1");
  return controller;
}

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}
