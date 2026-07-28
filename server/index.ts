import http from "node:http";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { registerRooms } from "./app.config";

const port = Number(process.env.PORT ?? 2567);
const server = http.createServer();

const gameServer = new Server({
  transport: new WebSocketTransport({ server })
});

registerRooms(gameServer);

gameServer.listen(port).then(() => {
  console.log(`Game server listening on ws://localhost:${port}`);
});
