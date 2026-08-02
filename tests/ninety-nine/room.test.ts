import assert from "node:assert/strict";
import test from "node:test";
import { TURN_DURATION_MS, getLegalActions } from "../../lib/games/ninety-nine";
import { NinetyNineRoomController } from "../../server/rooms/NinetyNineRoom";
import type { NinetyNineServerEvent } from "../../server/messages/ninetyNineMessages";
import { ManualRoomScheduler } from "../../server/utilities/scheduler";

test("controller creates waiting room, adds humans and bots, then starts when ready", () => {
  const events: Array<{ event: NinetyNineServerEvent; playerId?: string }> = [];
  const scheduler = new ManualRoomScheduler();
  const controller = new NinetyNineRoomController({
    maxPlayers: 4,
    initialBotCount: 1,
    scheduler,
    random: seeded(1),
    emit: (event, playerId) => events.push({ event, playerId })
  });

  controller.addHuman("s1", "阿德");
  controller.addHuman("s2", "小萱");
  assert.equal(controller.publicState.players.length, 3);
  assert.equal(controller.publicState.players[0].host, true);
  assert(Array.from(controller.publicState.players).some((player) => player.type === "bot"));

  controller.setReady("s1", "ready-1", true);
  controller.setReady("s2", "ready-2", true);
  controller.startGame("s1", "start");

  assert.equal(controller.publicState.phase, "playing");
  assert.equal(controller.publicState.players.length, 3);
  assert(events.some((item) => item.event.type === "GAME_STARTED"));
  assert(events.some((item) => item.event.type === "HAND_UPDATED" && item.playerId === "player-s1"));
  assert(events.some((item) => item.event.type === "HAND_UPDATED" && item.playerId === "player-s2"));
  controller.dispose();
});

test("controller deduplicates reconnects from the same browser tab", () => {
  const controller = new NinetyNineRoomController({ roomCode: "123456", random: seeded(2) });

  controller.addHuman("s1", "測試二", "tab-1");
  controller.addHuman("s2", "測試二", "tab-1");
  controller.addHuman("s3", "測試三", "tab-2");
  controller.setReady("s2", "ready-s2", true);

  assert.equal(controller.publicState.players.length, 2);
  assert.equal(controller.publicState.players[0]?.id, "player-s2");
  assert.equal(controller.publicState.players[0]?.ready, true);
  assert.equal(controller.publicState.players[1]?.nickname, "測試三");
});

test("non-host cannot manage bots or start the game", () => {
  const controller = new NinetyNineRoomController({ random: seeded(2) });
  controller.addHuman("s1", "房主");
  controller.addHuman("s2", "朋友");

  assert.throws(() => controller.addBot("s2", "bot", "normal"), /Only the host/);
  controller.setReady("s1", "r1", true);
  controller.setReady("s2", "r2", true);
  assert.throws(() => controller.startGame("s2", "start"), /Only the host/);
});

test("server resolves player identity and rejects non-current player", () => {
  const controller = readyStartedController();
  const state = controller.state;
  assert(state);

  const current = state.currentPlayerId;
  const nonCurrent = current === "player-s1" ? "s2" : "s1";
  const action = getLegalActions(state, current)[0];
  assert(action);
  assert.throws(() => controller.playCard(nonCurrent, "bad-turn", action.cardId, action.choice), /turn/);
});

test("duplicate actionId cannot execute twice and same card cannot be replayed", () => {
  const controller = readyStartedController();
  const state = controller.state;
  assert(state);

  const action = getLegalActions(state, state.currentPlayerId)[0];
  const session = state.currentPlayerId === "player-s1" ? "s1" : "s2";
  controller.playCard(session, "play-once", action.cardId, action.choice);
  assert.throws(() => controller.playCard(session, "play-once", action.cardId, action.choice), /Duplicate actionId/);
  assert.throws(() => controller.playCard(session, "play-again", action.cardId, action.choice));
});

test("timeout performs one server-authoritative automatic action", () => {
  const scheduler = new ManualRoomScheduler(1000);
  const events: NinetyNineServerEvent[] = [];
  const controller = new NinetyNineRoomController({
    scheduler,
    random: seeded(4),
    emit: (event) => events.push(event)
  });
  controller.addHuman("s1", "阿德");
  controller.addHuman("s2", "小萱");
  controller.setReady("s1", "r1", true);
  controller.setReady("s2", "r2", true);
  controller.startGame("s1", "start");

  const beforeTurn = controller.publicState.turnNumber;
  scheduler.advanceBy(TURN_DURATION_MS);

  assert.equal(controller.publicState.turnNumber, beforeTurn + 1);
  assert(events.some((event) => event.type === "CARD_PLAYED" && event.system));
});

test("dispose clears room timers", () => {
  const scheduler = new ManualRoomScheduler();
  const controller = readyStartedController(scheduler);
  assert(scheduler.activeTaskCount() > 0);
  controller.dispose();
  assert.equal(scheduler.activeTaskCount(), 0);
});

function readyStartedController(scheduler = new ManualRoomScheduler()) {
  const controller = new NinetyNineRoomController({ scheduler, random: seeded(3) });
  controller.addHuman("s1", "阿德");
  controller.addHuman("s2", "小萱");
  controller.setReady("s1", "r1", true);
  controller.setReady("s2", "r2", true);
  controller.startGame("s1", "start");
  return controller;
}

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}
