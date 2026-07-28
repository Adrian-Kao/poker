import type { Server } from "colyseus";
import { HeartAttackRoom } from "./rooms/HeartAttackRoom";

export function registerRooms(gameServer: Server) {
  gameServer.define("heart_attack", HeartAttackRoom).filterBy(["roomCode"]);
}
