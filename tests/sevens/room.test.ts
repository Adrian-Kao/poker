import assert from "node:assert/strict";
import test from "node:test";
import { SevensRoomController } from "../../server/rooms/SevensRoom";
import type { SevensServerEvent } from "../../server/messages/sevensMessages";
import { ManualRoomScheduler } from "../../server/utilities/scheduler";

test("sevens room starts when every seat is filled", () => {
  const events: Array<{ event: SevensServerEvent; playerId?: string }> = [];
  const controller = new SevensRoomController({ mode: "classic-four", maxPlayers: 4, bots: 2, scheduler: new ManualRoomScheduler(), random: seeded(7), emit: (event, playerId) => events.push({ event, playerId }) });
  controller.addHuman("s1", "房主", "tab-host");
  controller.addHuman("s2", "朋友", "tab-friend");
  controller.start("s1", "start-ok");

  assert.equal(controller.publicState.phase, "playing");
  assert.equal(controller.publicState.players.length, 4);
  assert.equal(Array.from(controller.publicState.players).reduce((sum, player) => sum + player.handCount, 0), 52);
  const privateHands = events.filter((item) => item.event.type === "PRIVATE_HAND");
  assert.deepEqual(privateHands.map((item) => item.playerId).sort(), ["player-s1", "player-s2"]);
  assert(privateHands.every((item) => item.playerId));
  assert(events.some((item) => item.event.type === "GAME_STARTED" && item.playerId === undefined));
  controller.dispose();
});

test("sevens room keeps hidden cards out of public state", () => {
  const events: Array<{ event: SevensServerEvent; playerId?: string }> = [];
  const controller = readyClassicController(events);
  assert.equal("hands" in controller.publicState, false);
  assert.equal("coveredCards" in controller.publicState, false);
  assert.equal(controller.publicState.tableauCards.length, 0);
  const handEvents = events.filter((item) => item.event.type === "PRIVATE_HAND");
  assert.equal(handEvents.length, 2);
  assert(handEvents.every((item) => item.playerId === "player-s1" || item.playerId === "player-s2"));
  controller.dispose();
});

test("sevens room rejects an action from a player who does not own the turn", () => {
  const events: Array<{ event: SevensServerEvent; playerId?: string }> = [];
  const controller = readyClassicController(events);
  const currentId = controller.state?.currentPlayerId;
  assert(currentId);
  const wrongSession = currentId === "player-s1" ? "s2" : "s1";
  const wrongHand = events.find((item) => item.playerId === `player-${wrongSession}` && item.event.type === "PRIVATE_HAND");
  const wrongHandEvent = wrongHand?.event;
  assert(wrongHandEvent?.type === "PRIVATE_HAND");
  assert.throws(() => controller.play(wrongSession, "wrong-turn", wrongHandEvent.cards[0].id), /Illegal sevens play/);
  controller.dispose();
});

test("sevens room deduplicates the same browser tab before the game starts", () => {
  const controller = new SevensRoomController({ roomCode: "123456", mode: "classic-four", random: seeded(3) });
  controller.addHuman("s1", "阿德", "same-tab");
  controller.addHuman("s2", "阿德", "same-tab");
  assert.equal(controller.publicState.players.length, 1);
  assert.equal(controller.publicState.players[0]?.id, "player-s2");
  assert.equal(controller.publicState.players[0]?.nickname, "阿德");
  controller.dispose();
});

test("double-deck race accepts five to eight configured seats", () => {
  const controller = new SevensRoomController({ mode: "double-deck-race", maxPlayers: 7, random: seeded(11) });
  assert.equal(controller.publicState.mode, "double-deck-race");
  assert.equal(controller.publicState.maxPlayers, 7);
  controller.dispose();
});

function readyClassicController(events: Array<{ event: SevensServerEvent; playerId?: string }>) {
  const controller = new SevensRoomController({ mode: "classic-four", maxPlayers: 4, bots: 2, scheduler: new ManualRoomScheduler(), random: seeded(19), emit: (event, playerId) => events.push({ event, playerId }) });
  controller.addHuman("s1", "房主", "tab-1");
  controller.addHuman("s2", "朋友", "tab-2");
  controller.setReady("s1", "ready-a", true);
  controller.setReady("s2", "ready-b", true);
  controller.start("s1", "start");
  return controller;
}

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}
