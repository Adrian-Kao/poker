import type { Server } from "colyseus";
import { HeartAttackRoom } from "./rooms/HeartAttackRoom";
import { NinetyNineRoom } from "./rooms/NinetyNineRoom";

export function registerRooms(gameServer: Server) {
  gameServer.define("heart_attack", HeartAttackRoom).filterBy(["roomCode"]);
  gameServer.define("ninety_nine", NinetyNineRoom).filterBy(["roomCode"]);
}

