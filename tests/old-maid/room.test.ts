import assert from "node:assert/strict";
import test from "node:test";
import { createSeededRandom } from "../../lib/games/core/random";
import type { OldMaidServerEvent } from "../../server/messages/oldMaidMessages";
import {
  OLD_MAID_DEAL_DURATION_MS,
  OLD_MAID_PAIR_INTERVAL_MS,
  OLD_MAID_READY_DURATION_MS,
  OLD_MAID_REVEAL_DURATION_MS,
  OLD_MAID_SHUFFLE_DURATION_MS,
  OLD_MAID_TURN_DURATION_MS,
  OldMaidRoomController
} from "../../server/rooms/OldMaidRoom";
import { ManualRoomScheduler } from "../../server/utilities/scheduler";

type RecordedEvent = {
  event: OldMaidServerEvent;
  playerId?: string;
};

test("controller deduplicates reconnects from the same browser tab", () => {
  const controller = new OldMaidRoomController({ roomCode: "123456", random: createSeededRandom(2) });

  controller.addHuman("s1", "測試二", "tab-1");
  controller.addHuman("s2", "測試二", "tab-1");
  controller.addHuman("s3", "測試三", "tab-2");
  controller.setReady("s2", "ready-s2", true);

  assert.equal(controller.publicState.players.length, 2);
  assert.equal(controller.publicState.players[0]?.id, "player-s2");
  assert.equal(controller.publicState.players[0]?.ready, true);
  assert.equal(controller.publicState.players[1]?.nickname, "測試三");
});

test("opening phases follow server deadlines and delay the first turn", (t) => {
  const scheduler = new ManualRoomScheduler(1000);
  const { controller, events } = createOpeningController(7, scheduler);
  t.after(() => controller.dispose());

  assert.equal(controller.publicState.phase, "shuffling");
  assert.equal(controller.publicState.phaseStartedAt, 1000);
  assert.equal(controller.publicState.phaseDeadline, 1000 + OLD_MAID_SHUFFLE_DURATION_MS);
  assert.equal(controller.publicState.turnNumber, 0);
  assert.equal(controller.publicState.turnDeadline, 0);
  assert.equal(scheduler.activeTaskCount(), 1);

  scheduler.advanceBy(OLD_MAID_SHUFFLE_DURATION_MS);
  assert.equal(controller.publicState.phase, "dealing");
  assert.equal(controller.publicState.phaseStartedAt, 1000 + OLD_MAID_SHUFFLE_DURATION_MS);
  assert.equal(
    controller.publicState.phaseDeadline,
    1000 + OLD_MAID_SHUFFLE_DURATION_MS + OLD_MAID_DEAL_DURATION_MS
  );
  assert(Array.from(controller.publicState.players).every((player) => player.cardsRemaining === 0));

  scheduler.advanceBy(OLD_MAID_DEAL_DURATION_MS);
  assert.equal(controller.publicState.phase, "revealing");
  const revealedHands = privateHandEvents(events, 0).slice(-3);
  assert.equal(revealedHands.length, 3);
  assert.equal(
    revealedHands.reduce((sum, record) => sum + record.event.cards.length, 0),
    54
  );
  assert(revealedHands.every((record) => typeof record.playerId === "string"));
  assert.equal(
    Array.from(controller.publicState.players)
      .reduce((sum, player) => sum + player.cardsRemaining, 0),
    54
  );

  scheduler.advanceBy(OLD_MAID_REVEAL_DURATION_MS);
  assert.equal(controller.publicState.phase, "organizing");
  assert.equal(
    controller.publicState.phaseDeadline,
    scheduler.now() + OLD_MAID_PAIR_INTERVAL_MS
  );

  while (controller.publicState.phase === "organizing") {
    const beforeCounts = new Map(
      Array.from(controller.publicState.players)
        .map((player) => [player.id, player.cardsRemaining])
    );
    const eventStart = events.length;
    scheduler.advanceBy(OLD_MAID_PAIR_INTERVAL_MS);
    const pairEvents = events.slice(eventStart).filter(
      (record): record is RecordedEvent & {
        event: Extract<OldMaidServerEvent, { type: "PAIRS_REMOVED" }>;
      } => record.event.type === "PAIRS_REMOVED"
    );
    assert.equal(
      new Set(pairEvents.map((record) => record.event.playerId)).size,
      pairEvents.length
    );
    pairEvents.forEach((record) => {
      assert.equal(record.event.ranks.length, 1);
      assert.equal(
        publicPlayer(controller, record.event.playerId).cardsRemaining,
        requireValue(beforeCounts.get(record.event.playerId)) - 2
      );
    });
    assert.equal(controller.publicState.turnDeadline, 0);
  }

  assert.equal(controller.publicState.phase, "ready");
  assert.equal(
    controller.publicState.phaseDeadline,
    scheduler.now() + OLD_MAID_READY_DURATION_MS
  );
  assert.equal(controller.publicState.turnDeadline, 0);

  scheduler.advanceBy(OLD_MAID_READY_DURATION_MS);
  assert.equal(controller.publicState.phase, "playing");
  assert.equal(controller.publicState.phaseStartedAt, 0);
  assert.equal(controller.publicState.phaseDeadline, 0);
  assert.equal(controller.publicState.turnNumber, 1);
  assert.equal(
    controller.publicState.turnDeadline,
    scheduler.now() + OLD_MAID_TURN_DURATION_MS
  );
});

test("opening rejects draws and reconnects without resetting the current phase", (t) => {
  const scheduler = new ManualRoomScheduler(2000);
  const { controller, events } = createOpeningController(17, scheduler);
  t.after(() => controller.dispose());
  const state = requireStartedState(controller);
  const currentPlayerId = requireValue(state.currentPlayerId);
  const slot = requireValue(state.drawLayout?.slots[0]);

  assert.throws(
    () => controller.drawCard(
      sessionIdFor(currentPlayerId),
      "opening-draw",
      state.turnNumber,
      slot.cardSlotId
    ),
    /opening sequence/
  );

  scheduler.advanceBy(OLD_MAID_SHUFFLE_DURATION_MS);
  scheduler.advanceBy(OLD_MAID_DEAL_DURATION_MS);
  scheduler.advanceBy(OLD_MAID_REVEAL_DURATION_MS);
  assert.equal(controller.publicState.phase, "organizing");
  const phaseStartedAt = controller.publicState.phaseStartedAt;
  const phaseDeadline = controller.publicState.phaseDeadline;

  controller.markDisconnected("s2");
  const eventStart = events.length;
  controller.markReconnected("s2");
  const reconnectEvents = events.slice(eventStart);

  assert.equal(controller.publicState.phaseStartedAt, phaseStartedAt);
  assert.equal(controller.publicState.phaseDeadline, phaseDeadline);
  assert.equal(scheduler.activeTaskCount(), 1);
  assert(
    reconnectEvents.some(
      (record) => record.playerId === "player-s2"
        && record.event.type === "HAND_UPDATED"
        && record.event.turnNumber === 0
    )
  );
  assert(
    reconnectEvents.every(
      (record) => !record.playerId || record.playerId === "player-s2"
    )
  );
});

test("disposing during the opening clears its timer", () => {
  const scheduler = new ManualRoomScheduler();
  const { controller } = createOpeningController(27, scheduler);
  assert.equal(scheduler.activeTaskCount(), 1);

  controller.dispose();

  assert.equal(scheduler.activeTaskCount(), 0);
});

test("game start publishes counts while hands and draw options stay private", (t) => {
  const { controller, events } = createPlayingController();
  t.after(() => controller.dispose());
  const state = requireStartedState(controller);

  assert.equal(controller.publicState.phase, "playing");
  assert.equal(controller.publicState.players.length, 3);

  const handEvents = events.filter(
    (record): record is RecordedEvent & {
      event: Extract<OldMaidServerEvent, { type: "HAND_UPDATED" }>;
      playerId: string;
    } => record.event.type === "HAND_UPDATED"
      && record.event.turnNumber === state.turnNumber
      && typeof record.playerId === "string"
  );
  assert.equal(handEvents.length, 3);
  assert.deepEqual(
    handEvents.map((record) => record.playerId).sort(),
    ["player-s1", "player-s2", "player-s3"]
  );

  const currentPlayerId = requireValue(state.currentPlayerId);
  const targetPlayerId = requireValue(state.targetPlayerId);
  const targetHand = handEvents.find((record) => record.playerId === targetPlayerId);
  assert(targetHand);
  assert.deepEqual(
    targetHand.event.cards.map((card) => card.id),
    state.hands[targetPlayerId].map((card) => card.id)
  );

  const drawOptions = events.find(
    (record): record is RecordedEvent & {
      event: Extract<OldMaidServerEvent, { type: "DRAW_OPTIONS_UPDATED" }>;
      playerId: string;
    } => record.event.type === "DRAW_OPTIONS_UPDATED"
  );
  assert(drawOptions);
  assert.equal(drawOptions.playerId, currentPlayerId);
  assert.equal(drawOptions.event.targetPlayerId, targetPlayerId);
  assert.deepEqual(
    drawOptions.event.cardSlotIds,
    state.drawLayout?.slots.map((slot) => slot.cardSlotId)
  );

  const publicJson = JSON.stringify(controller.publicState.toJSON());
  Object.values(state.hands).flat().forEach((card) => {
    assert.equal(publicJson.includes(card.id), false);
  });
  assert.equal(publicJson.includes("cardSlotId"), false);
  assert.equal(publicJson.includes("sessionId"), false);
  assert.equal(publicJson.includes("actionId"), false);
});

test("only the host can start and every joined player must be connected and ready", () => {
  const controller = createWaitingController();
  controller.setReady("s1", "ready-s1", true);
  controller.setReady("s2", "ready-s2", true);

  assert.throws(
    () => controller.startGame("s1", "start-before-ready"),
    /connected and ready/
  );

  controller.setReady("s3", "ready-s3", true);
  assert.throws(
    () => controller.startGame("s2", "start-by-non-host"),
    /Only the host/
  );
  assert.equal(controller.publicState.phase, "waiting");
});

test("public player schema references stay stable across lobby updates", () => {
  const controller = new OldMaidRoomController({
    roomCode: "123456",
    scheduler: new ManualRoomScheduler(),
    random: createSeededRandom(3)
  });
  controller.addHuman("s1", "A");
  const firstPlayerSchema = controller.publicState.players[0];

  controller.addHuman("s2", "B");
  controller.setReady("s1", "stable-ready", true);

  assert.equal(controller.publicState.players[0], firstPlayerSchema);
  assert.equal(firstPlayerSchema.id, "player-s1");
  assert.equal(firstPlayerSchema.ready, true);
});

test("the session determines player identity and a non-current player cannot draw", (t) => {
  const { controller, events } = createPlayingController(12);
  t.after(() => controller.dispose());
  const state = requireStartedState(controller);
  const currentPlayerId = requireValue(state.currentPlayerId);
  const nonCurrentSession = ["s1", "s2", "s3"].find(
    (sessionId) => playerIdFor(sessionId) !== currentPlayerId
  );
  const slot = requireValue(state.drawLayout?.slots[0]);

  assert(nonCurrentSession);
  assert.throws(
    () => controller.drawCard(
      nonCurrentSession,
      "draw-by-wrong-player",
      state.turnNumber,
      slot.cardSlotId
    ),
    /turn/
  );

  controller.drawCard(
    sessionIdFor(currentPlayerId),
    "draw-by-current-player",
    state.turnNumber,
    slot.cardSlotId
  );

  const drawn = events.find(
    (record): record is RecordedEvent & {
      event: Extract<OldMaidServerEvent, { type: "CARD_DRAWN" }>;
    } => record.event.type === "CARD_DRAWN"
  );
  assert(drawn);
  assert.equal(drawn.event.playerId, currentPlayerId);
  assert.equal(drawn.event.targetPlayerId, slotTarget(state));
  assert.equal(drawn.event.system, false);
});

test("duplicate actionId and stale turn data cannot execute a second draw", (t) => {
  const { controller } = createPlayingController(22);
  t.after(() => controller.dispose());
  const state = requireStartedState(controller);
  const currentPlayerId = requireValue(state.currentPlayerId);
  const sessionId = sessionIdFor(currentPlayerId);
  const turnNumber = state.turnNumber;
  const cardSlotId = requireValue(state.drawLayout?.slots[0]).cardSlotId;

  controller.drawCard(sessionId, "draw-once", turnNumber, cardSlotId);

  assert.throws(
    () => controller.drawCard(sessionId, "draw-once", turnNumber, cardSlotId),
    /Duplicate actionId/
  );
  assert.throws(
    () => controller.drawCard(sessionId, "draw-with-stale-state", turnNumber, cardSlotId),
    /Stale|turn/
  );
});

test("turn timeout performs exactly one server-authoritative draw", (t) => {
  const scheduler = new ManualRoomScheduler(1000);
  const { controller, events } = createPlayingController(31, scheduler);
  t.after(() => controller.dispose());
  const beforeTurn = requireStartedState(controller).turnNumber;
  const beforeSystemDraws = systemDrawCount(events);

  assert.equal(
    controller.publicState.turnDeadline,
    scheduler.now() + OLD_MAID_TURN_DURATION_MS
  );
  assert.equal(scheduler.activeTaskCount(), 1);

  scheduler.advanceBy(OLD_MAID_TURN_DURATION_MS);

  assert.equal(requireStartedState(controller).turnNumber, beforeTurn + 1);
  assert.equal(systemDrawCount(events), beforeSystemDraws + 1);
  assert.equal(scheduler.activeTaskCount(), 1);

  scheduler.advanceBy(0);
  assert.equal(systemDrawCount(events), beforeSystemDraws + 1);
});

test("reconnection restores only that player's private state and keeps the deadline", (t) => {
  const scheduler = new ManualRoomScheduler(5000);
  const { controller, events } = createPlayingController(41, scheduler);
  t.after(() => controller.dispose());
  const state = requireStartedState(controller);
  const currentPlayerId = requireValue(state.currentPlayerId);
  const sessionId = sessionIdFor(currentPlayerId);
  const deadline = controller.publicState.turnDeadline;

  controller.markDisconnected(sessionId);
  assert.equal(publicPlayer(controller, currentPlayerId).connected, false);
  assert.equal(controller.publicState.turnDeadline, deadline);

  const eventCountBeforeReconnect = events.length;
  controller.markReconnected(sessionId);
  const reconnectEvents = events.slice(eventCountBeforeReconnect);
  const privateEvents = reconnectEvents.filter((record) => record.playerId);

  assert.equal(publicPlayer(controller, currentPlayerId).connected, true);
  assert.equal(controller.publicState.turnDeadline, deadline);
  assert(privateEvents.some((record) => record.event.type === "HAND_UPDATED"));
  assert(privateEvents.some((record) => record.event.type === "DRAW_OPTIONS_UPDATED"));
  assert(privateEvents.every((record) => record.playerId === currentPlayerId));
});

test("an expired waiting-room disconnect removes the seat and promotes a host", () => {
  const controller = createWaitingController();

  controller.markDisconnected("s1");
  assert.equal(controller.publicState.players.length, 3);
  controller.expireDisconnectedPlayer("s1");

  assert.equal(controller.publicState.players.length, 2);
  assert.deepEqual(
    Array.from(controller.publicState.players).map((player) => ({
      id: player.id,
      seat: player.seat,
      host: player.host
    })),
    [
      { id: "player-s2", seat: 0, host: true },
      { id: "player-s3", seat: 1, host: false }
    ]
  );
});

test("a permanent in-game disconnect preserves the hand and promotes a connected host", (t) => {
  const { controller } = createPlayingController(51);
  t.after(() => controller.dispose());
  const state = requireStartedState(controller);
  const handSize = state.hands["player-s1"].length;

  controller.markDisconnected("s1");
  controller.expireDisconnectedPlayer("s1");

  assert.equal(controller.publicState.players.length, 3);
  assert.equal(publicPlayer(controller, "player-s1").connected, false);
  assert.equal(publicPlayer(controller, "player-s1").cardsRemaining, handSize);
  assert.equal(state.hands["player-s1"].length, handSize);
  assert(
    Array.from(controller.publicState.players)
      .some((player) => player.connected && player.host)
  );
});

test("dispose clears the active turn timer", () => {
  const scheduler = new ManualRoomScheduler();
  const { controller } = createPlayingController(61, scheduler);
  assert.equal(scheduler.activeTaskCount(), 1);

  controller.dispose();

  assert.equal(scheduler.activeTaskCount(), 0);
});

function createWaitingController(
  seed = 1,
  scheduler = new ManualRoomScheduler(),
  events: RecordedEvent[] = []
) {
  const controller = new OldMaidRoomController({
    roomCode: "123456",
    scheduler,
    random: createSeededRandom(seed),
    emit: (event, playerId) => events.push({ event, playerId })
  });
  controller.addHuman("s1", "阿德");
  controller.addHuman("s2", "小米");
  controller.addHuman("s3", "怡君");
  return controller;
}

function createOpeningController(
  seed = 1,
  scheduler = new ManualRoomScheduler()
) {
  const events: RecordedEvent[] = [];
  const controller = createWaitingController(seed, scheduler, events);
  controller.setReady("s1", "ready-s1", true);
  controller.setReady("s2", "ready-s2", true);
  controller.setReady("s3", "ready-s3", true);
  controller.startGame("s1", "start-game");
  return { controller, scheduler, events };
}

function createPlayingController(
  seed = 1,
  scheduler = new ManualRoomScheduler()
) {
  const result = createOpeningController(seed, scheduler);
  completeOpening(result.controller, scheduler);
  return result;
}

function completeOpening(
  controller: OldMaidRoomController,
  scheduler: ManualRoomScheduler
) {
  scheduler.advanceBy(OLD_MAID_SHUFFLE_DURATION_MS);
  scheduler.advanceBy(OLD_MAID_DEAL_DURATION_MS);
  scheduler.advanceBy(OLD_MAID_REVEAL_DURATION_MS);
  while (controller.publicState.phase === "organizing") {
    scheduler.advanceBy(OLD_MAID_PAIR_INTERVAL_MS);
  }
  assert.equal(controller.publicState.phase, "ready");
  scheduler.advanceBy(OLD_MAID_READY_DURATION_MS);
  assert.match(controller.publicState.phase, /playing|finished/);
}

function requireStartedState(controller: OldMaidRoomController) {
  const state = controller.state;
  if (!state) throw new Error("Expected a started Old Maid game.");
  return state;
}

function requireValue<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Expected a value.");
  return value;
}

function publicPlayer(controller: OldMaidRoomController, playerId: string) {
  const player = Array.from(controller.publicState.players)
    .find((item) => item.id === playerId);
  if (!player) throw new Error(`Missing public player ${playerId}.`);
  return player;
}

function playerIdFor(sessionId: string) {
  return `player-${sessionId}`;
}

function sessionIdFor(playerId: string) {
  return playerId.replace(/^player-/, "");
}

function slotTarget(state: ReturnType<typeof requireStartedState>) {
  return requireValue(state.drawLayout).targetPlayerId;
}

function systemDrawCount(events: RecordedEvent[]) {
  return events.filter(
    (record) => record.event.type === "CARD_DRAWN" && record.event.system
  ).length;
}

function privateHandEvents(events: RecordedEvent[], turnNumber: number) {
  return events.filter(
    (record): record is RecordedEvent & {
      event: Extract<OldMaidServerEvent, { type: "HAND_UPDATED" }>;
      playerId: string;
    } => record.event.type === "HAND_UPDATED"
      && record.event.turnNumber === turnNumber
      && typeof record.playerId === "string"
  );
}
