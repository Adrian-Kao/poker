import assert from "node:assert/strict";
import test from "node:test";
import { PICK_RED_BOTTOM_CARD_CONFIRM_MS } from "../../lib/games/pick-red-points";
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

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}
