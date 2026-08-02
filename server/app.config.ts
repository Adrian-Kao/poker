import type { Server } from "colyseus";
import { BluffRoom } from "./rooms/BluffRoom";
import { HeartAttackRoom } from "./rooms/HeartAttackRoom";
import { NinetyNineRoom } from "./rooms/NinetyNineRoom";
import { OldMaidRoom } from "./rooms/OldMaidRoom";
import { PickRedPointsRoom } from "./rooms/PickRedPointsRoom";

export function registerRooms(gameServer: Server) {
  gameServer.define("bluff", BluffRoom).filterBy(["roomCode"]);
  gameServer.define("heart_attack", HeartAttackRoom).filterBy(["roomCode"]);
  gameServer.define("ninety_nine", NinetyNineRoom).filterBy(["roomCode"]);
  gameServer.define("old_maid", OldMaidRoom).filterBy(["roomCode"]);
  gameServer.define("pick_red_points", PickRedPointsRoom).filterBy(["roomCode"]);
}
