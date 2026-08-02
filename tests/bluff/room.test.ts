import assert from "node:assert/strict";
import test from "node:test";
import { createSeededRandom } from "../../lib/games/core/random";
import { BluffRoomController } from "../../server/rooms/BluffRoom";

test("controller deduplicates reconnects from the same browser tab", () => {
  const controller = new BluffRoomController({ roomCode: "123456", random: createSeededRandom(2) });

  controller.addHuman("s1", "測試二", "tab-1");
  controller.addHuman("s2", "測試二", "tab-1");
  controller.addHuman("s3", "測試三", "tab-2");
  controller.setReady("s2", "ready-s2", true);

  assert.equal(controller.publicState.players.length, 2);
  assert.equal(controller.publicState.players[0]?.id, "player-s2");
  assert.equal(controller.publicState.players[0]?.ready, true);
  assert.equal(controller.publicState.players[1]?.nickname, "測試三");
});
