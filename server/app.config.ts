import config from "@colyseus/tools";
import { LocalDriver, LocalPresence, matchMaker, type Server } from "colyseus";
import { BluffRoom } from "./rooms/BluffRoom";
import { HeartAttackRoom } from "./rooms/HeartAttackRoom";
import { NinetyNineRoom } from "./rooms/NinetyNineRoom";
import { OldMaidRoom } from "./rooms/OldMaidRoom";
import { PickRedPointsRoom } from "./rooms/PickRedPointsRoom";
import { BigTwoRoom } from "./rooms/BigTwoRoom";
import { SevensRoom } from "./rooms/SevensRoom";

export function registerRooms(gameServer: Server) {
  gameServer.define("bluff", BluffRoom).filterBy(["roomCode"]);
  gameServer.define("heart_attack", HeartAttackRoom).filterBy(["roomCode"]);
  gameServer.define("ninety_nine", NinetyNineRoom).filterBy(["roomCode"]);
  gameServer.define("old_maid", OldMaidRoom).filterBy(["roomCode"]);
  gameServer.define("pick_red_points", PickRedPointsRoom).filterBy(["roomCode"]);
  gameServer.define("big_two", BigTwoRoom).filterBy(["roomCode"]);
  gameServer.define("sevens", SevensRoom).filterBy(["roomCode"]);
}

export default config({
  options: {
    driver: new LocalDriver(),
    presence: new LocalPresence()
  },

  initializeExpress: (app) => {
    app.get("/", (_request, response) => {
      response.status(200).json({ ok: true, service: "poker-colyseus-server" });
    });

    app.get("/health", (_request, response) => {
      response.status(200).json({ ok: true });
    });

    app.get("/rooms/:roomCode", async (request, response) => {
      const roomCode = request.params.roomCode.replace(/\D/g, "").slice(0, 6);
      if (roomCode.length !== 6) {
        response.status(400).json({ ok: false, error: "INVALID_ROOM_CODE" });
        return;
      }
      const rooms = await matchMaker.query({ locked: false });
      const room = rooms.find((item) => item.metadata?.roomCode === roomCode);
      if (!room) {
        response.status(404).json({ ok: false, error: "ROOM_NOT_FOUND" });
        return;
      }
      response.status(200).json({ ok: true, roomType: room.name });
    });
  },

  initializeGameServer: (gameServer) => {
    registerRooms(gameServer);
  }
});
