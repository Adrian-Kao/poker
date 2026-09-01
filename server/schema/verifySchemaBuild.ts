import { ArraySchema, Encoder, MapSchema, Schema } from "@colyseus/schema";
import { getLegalPlays as getBigTwoLegalPlays } from "../../lib/games/big-two";
import { getLegalActions } from "../../lib/games/ninety-nine";
import { PICK_RED_BOTTOM_CARD_CONFIRM_MS } from "../../lib/games/pick-red-points";
import { getLegalPlays as getSevensLegalPlays } from "../../lib/games/sevens";
import { BigTwoRoomController } from "../rooms/BigTwoRoom";
import { BluffRoomController } from "../rooms/BluffRoom";
import { HeartAttackRoomController } from "../rooms/HeartAttackRoom";
import {
  OLD_MAID_DEAL_DURATION_MS,
  OLD_MAID_PAIR_INTERVAL_MS,
  OLD_MAID_READY_DURATION_MS,
  OLD_MAID_REVEAL_DURATION_MS,
  OLD_MAID_SHUFFLE_DURATION_MS,
  OldMaidRoomController
} from "../rooms/OldMaidRoom";
import { NinetyNineRoomController } from "../rooms/NinetyNineRoom";
import { PickRedPointsRoomController } from "../rooms/PickRedPointsRoom";
import { SevensRoomController } from "../rooms/SevensRoom";
import { ManualRoomScheduler } from "../utilities/scheduler";
import { BigTwoRoomStateSchema, PublicBigTwoCard, PublicBigTwoPlayer } from "./BigTwoRoomState";
import { BluffRoomStateSchema, PublicBluffCard, PublicBluffPlayer } from "./BluffRoomState";
import { HeartAttackRoomStateSchema, PublicHeartAttackPlayer } from "./HeartAttackRoomState";
import { NinetyNineRoomStateSchema, PublicNinetyNinePlayer } from "./NinetyNineRoomState";
import { OldMaidRoomStateSchema, PublicOldMaidPlayer } from "./OldMaidRoomState";
import { PickRedPointsRoomStateSchema, PublicPickRedCard, PublicPickRedPlayer } from "./PickRedPointsRoomState";
import { PublicSevensCard, PublicSevensPlayer, PublicSevensStanding, SevensRoomStateSchema } from "./SevensRoomState";

type Controller = { publicState: Schema; dispose(): void };

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function requirePatch(encoder: Encoder<Schema>, label: string) {
  try {
    const patch = encoder.encode();
    encoder.discardChanges();
    if (patch.length === 0) throw new Error("mutation produced an empty patch");
  } catch (error) {
    throw new Error(`Schema serialization failed during ${label}.`, { cause: error });
  }
}

function createEncoder(state: Schema, label: string) {
  try {
    const encoder = new Encoder(state);
    const initial = encoder.encodeAll();
    encoder.discardChanges();
    if (initial.length === 0) throw new Error("initial state produced an empty payload");
    return encoder as Encoder<Schema>;
  } catch (error) {
    throw new Error(`Schema serialization failed during ${label} initial encode.`, { cause: error });
  }
}

function verifyCollections() {
  const cases: Array<{ label: string; state: Schema; mutate: () => void; clear: () => void }> = [];

  const bigTwo = new BigTwoRoomStateSchema();
  cases.push({ label: "big_two", state: bigTwo, mutate: () => { bigTwo.players.push(new PublicBigTwoPlayer()); bigTwo.lastCards.push(new PublicBigTwoCard()); bigTwo.winnerIds.push("p1"); }, clear: () => { bigTwo.players.clear(); bigTwo.lastCards.clear(); bigTwo.winnerIds.clear(); } });
  const bluff = new BluffRoomStateSchema();
  cases.push({ label: "bluff", state: bluff, mutate: () => { bluff.players.push(new PublicBluffPlayer()); bluff.revealedCards.push(new PublicBluffCard()); }, clear: () => { bluff.players.clear(); bluff.revealedCards.clear(); } });
  const heart = new HeartAttackRoomStateSchema();
  cases.push({ label: "heart_attack", state: heart, mutate: () => { heart.players.push(new PublicHeartAttackPlayer()); heart.connectedSessions.set("s1", "p1"); }, clear: () => { heart.players.clear(); heart.connectedSessions.clear(); } });
  const ninetyNine = new NinetyNineRoomStateSchema();
  cases.push({ label: "ninety_nine", state: ninetyNine, mutate: () => { ninetyNine.players.push(new PublicNinetyNinePlayer()); ninetyNine.lastCard.id = "clubs-3"; }, clear: () => { ninetyNine.players.clear(); ninetyNine.lastCard.id = ""; } });
  const oldMaid = new OldMaidRoomStateSchema();
  cases.push({ label: "old_maid", state: oldMaid, mutate: () => oldMaid.players.push(new PublicOldMaidPlayer()), clear: () => oldMaid.players.clear() });
  const pickRed = new PickRedPointsRoomStateSchema();
  cases.push({ label: "pick_red_points", state: pickRed, mutate: () => { pickRed.players.push(new PublicPickRedPlayer()); pickRed.tableCards.push(new PublicPickRedCard()); }, clear: () => { pickRed.players.clear(); pickRed.tableCards.clear(); } });
  const sevens = new SevensRoomStateSchema();
  cases.push({ label: "sevens", state: sevens, mutate: () => { sevens.players.push(new PublicSevensPlayer()); sevens.tableauCards.push(new PublicSevensCard()); sevens.standings.push(new PublicSevensStanding()); }, clear: () => { sevens.players.clear(); sevens.tableauCards.clear(); sevens.standings.clear(); } });

  for (const item of cases) {
    const encoder = createEncoder(item.state, `${item.label} collections`);
    item.mutate();
    assertCollections(item.state, item.label);
    requirePatch(encoder, `${item.label} collection insertion`);
    item.clear();
    requirePatch(encoder, `${item.label} collection clearing`);
  }
}

function assertCollections(schema: Schema, label: string) {
  for (const [key, value] of Object.entries(schema)) {
    if (value === undefined) throw new Error(`${label}.${key} is undefined.`);
    if (value instanceof ArraySchema) {
      Array.from(value).forEach((item, index) => {
        if (item === undefined) throw new Error(`${label}.${key}[${index}] is undefined.`);
      });
    }
    if (value instanceof MapSchema) {
      value.forEach((item, mapKey) => {
        if (item === undefined) throw new Error(`${label}.${key}[${mapKey}] is undefined.`);
      });
    }
  }
}

function lifecycle(label: string, controller: Controller, steps: Array<() => void>, scheduler: ManualRoomScheduler) {
  const encoder = createEncoder(controller.publicState, `${label} lifecycle`);
  try {
    steps.forEach((step, index) => {
      step();
      assertCollections(controller.publicState, label);
      requirePatch(encoder, `${label} lifecycle step ${index + 1}`);
    });
  } finally {
    controller.dispose();
  }
  if (scheduler.activeTaskCount() !== 0) throw new Error(`${label} left active timers after dispose().`);
}

function verifyRoomLifecycles() {
  verifyBigTwo();
  verifyBluff();
  verifyHeartAttack();
  verifyNinetyNine();
  verifyOldMaid();
  verifyPickRedPoints();
  verifySevens();
}

function verifyBigTwo() {
  const scheduler = new ManualRoomScheduler();
  const controller = new BigTwoRoomController({ maxPlayers: 3, scheduler, random: seeded(1) });
  lifecycle("big_two", controller, [
    () => { controller.addHuman("s1", "P1", "c1"); controller.addHuman("s2", "P2", "c2"); controller.addHuman("s3", "P3", "c3"); },
    () => { controller.setReady("s1", true); controller.setReady("s2", true); controller.setReady("s3", true); controller.start("s1"); },
    () => { const state = controller.state!; const play = getBigTwoLegalPlays(state, state.currentPlayerId!)[0]; const session = state.currentPlayerId!.replace("player-", ""); controller.play(session, "schema-play", play.map((card) => card.id)); }
  ], scheduler);
}

function verifyBluff() {
  const scheduler = new ManualRoomScheduler();
  const controller = new BluffRoomController({ maxPlayers: 3, scheduler, random: seeded(2) });
  lifecycle("bluff", controller, [
    () => { controller.addHuman("s1", "P1", "c1"); controller.addHuman("s2", "P2", "c2"); controller.addHuman("s3", "P3", "c3"); },
    () => controller.startGame("s1", "start"),
    () => { const state = controller.state!; const playerId = state.currentPlayerId!; const card = state.hands[playerId][0]; controller.playCards(playerId.replace("player-", ""), "schema-play", [card.id], card.rank); }
  ], scheduler);
}

function verifyHeartAttack() {
  const scheduler = new ManualRoomScheduler(1000);
  const controller = new HeartAttackRoomController({ maxPlayers: 3, scheduler, random: seeded(3) });
  lifecycle("heart_attack", controller, [
    () => { controller.addHuman("s1", "P1", "c1"); controller.addHuman("s2", "P2", "c2"); controller.addHuman("s3", "P3", "c3"); },
    () => controller.startGame("s1", "start"),
    () => scheduler.advanceBy(900)
  ], scheduler);
}

function verifyNinetyNine() {
  const scheduler = new ManualRoomScheduler();
  const controller = new NinetyNineRoomController({ maxPlayers: 2, scheduler, random: seeded(4) });
  lifecycle("ninety_nine", controller, [
    () => { controller.addHuman("s1", "P1", "c1"); controller.addHuman("s2", "P2", "c2"); },
    () => controller.startGame("s1", "start"),
    () => { const state = controller.state!; const action = getLegalActions(state, state.currentPlayerId!)[0]; controller.playCard(state.currentPlayerId!.replace("player-", ""), "schema-play", action.cardId, action.choice); }
  ], scheduler);
}

function verifyOldMaid() {
  const scheduler = new ManualRoomScheduler();
  const events: Array<{ event: { type: string; turnNumber?: number; cardSlotIds?: string[] }; playerId?: string }> = [];
  const controller = new OldMaidRoomController({ maxPlayers: 3, scheduler, random: seeded(5), emit: (event, playerId) => events.push({ event, playerId }) });
  lifecycle("old_maid", controller, [
    () => { controller.addHuman("s1", "P1", "c1"); controller.addHuman("s2", "P2", "c2"); controller.addHuman("s3", "P3", "c3"); },
    () => controller.startGame("s1", "start"),
    () => {
      scheduler.advanceBy(OLD_MAID_SHUFFLE_DURATION_MS);
      scheduler.advanceBy(OLD_MAID_DEAL_DURATION_MS);
      scheduler.advanceBy(OLD_MAID_REVEAL_DURATION_MS);
      while (controller.publicState.phase === "organizing") scheduler.advanceBy(OLD_MAID_PAIR_INTERVAL_MS);
      if (controller.publicState.phase === "ready") scheduler.advanceBy(OLD_MAID_READY_DURATION_MS);
      const state = controller.state!;
      if (!state.currentPlayerId) throw new Error("old_maid has no current player.");
      const option = [...events].reverse().find((item) => item.event.type === "DRAW_OPTIONS_UPDATED" && item.playerId === state.currentPlayerId);
      const slot = option?.event.cardSlotIds?.[0];
      if (!slot) throw new Error("old_maid did not publish a draw option.");
      controller.drawCard(state.currentPlayerId.replace("player-", ""), "schema-draw", state.turnNumber, slot);
    }
  ], scheduler);
}

function verifyPickRedPoints() {
  const scheduler = new ManualRoomScheduler();
  const controller = new PickRedPointsRoomController({ maxPlayers: 2, scheduler, random: seeded(6) });
  lifecycle("pick_red_points", controller, [
    () => { controller.addHuman("s1", "P1", "c1"); controller.addHuman("s2", "P2", "c2"); },
    () => controller.startGame("s1", "start"),
    () => { scheduler.advanceBy(PICK_RED_BOTTOM_CARD_CONFIRM_MS); const state = controller.state!; const playerId = state.currentPlayerId; if (!playerId) throw new Error("pick_red_points has no current player."); controller.playHand(playerId.replace("player-", ""), "schema-play", state.hands[playerId][0].id); }
  ], scheduler);
}

function verifySevens() {
  const scheduler = new ManualRoomScheduler();
  const controller = new SevensRoomController({ mode: "classic-four", maxPlayers: 4, scheduler, random: seeded(7) });
  lifecycle("sevens", controller, [
    () => { for (let index = 1; index <= 4; index += 1) controller.addHuman(`s${index}`, `P${index}`, `c${index}`); },
    () => controller.start("s1", "start"),
    () => { const state = controller.state!; const playerId = state.currentPlayerId; if (!playerId) throw new Error("sevens has no current player."); const card = getSevensLegalPlays(state, playerId)[0]; controller.play(playerId.replace("player-", ""), "schema-play", card.id); }
  ], scheduler);
}

verifyCollections();
verifyRoomLifecycles();
console.log("All registered room Schema serialization checks passed.");
