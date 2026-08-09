import http from "node:http";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { registerRooms } from "./app.config";

const port = Number(process.env.PORT ?? 2567);
const host = "0.0.0.0";
const app = express();

app.get("/", (_request, response) => {
  response.status(200).json({ ok: true, service: "poker-colyseus-server" });
});

app.get("/health", (_request, response) => {
  response.status(200).json({ ok: true });
});

const server = http.createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server })
});

registerRooms(gameServer);

gameServer.listen(port, host).then(() => {
  if (typeof process.send === "function") {
    process.send("ready");
  }

  console.log(`Game server listening on ws://${host}:${port}`);
});
