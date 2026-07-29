import { ArraySchema, Schema, defineTypes } from "@colyseus/schema";
import type { NinetyNineState } from "../../lib/games/ninety-nine";

export class PublicNinetyNinePlayer extends Schema {
  id = "";
  nickname = "";
  seat = 0;
  type = "human";
  status = "playing";
  connected = true;
  ready = false;
  cardsRemaining = 0;
  botDifficulty = "";
  host = false;
}

defineTypes(PublicNinetyNinePlayer, {
  id: "string",
  nickname: "string",
  seat: "number",
  type: "string",
  status: "string",
  connected: "boolean",
  ready: "boolean",
  cardsRemaining: "number",
  botDifficulty: "string",
  host: "boolean"
});

export class PublicNinetyNineCard extends Schema {
  id = "";
  rank = "";
  suit = "";
}

defineTypes(PublicNinetyNineCard, {
  id: "string",
  rank: "string",
  suit: "string"
});

export class NinetyNineRoomStateSchema extends Schema {
  roomCode = "";
  phase = "waiting";
  maxPlayers = 4;
  round = 1;
  currentTotal = 0;
  currentPlayerId = "";
  direction = 1;
  turnNumber = 0;
  turnDeadline = 0;
  drawPileCount = 0;
  discardPileCount = 0;
  winnerId = "";
  lastEffect = "";
  lastSystemAction = false;
  players = new ArraySchema<PublicNinetyNinePlayer>();
  lastCard = new PublicNinetyNineCard();
}

defineTypes(NinetyNineRoomStateSchema, {
  roomCode: "string",
  phase: "string",
  maxPlayers: "number",
  round: "number",
  currentTotal: "number",
  currentPlayerId: "string",
  direction: "number",
  turnNumber: "number",
  turnDeadline: "number",
  drawPileCount: "number",
  discardPileCount: "number",
  winnerId: "string",
  lastEffect: "string",
  lastSystemAction: "boolean",
  players: [PublicNinetyNinePlayer],
  lastCard: PublicNinetyNineCard
});

export type LobbyNinetyNinePlayer = {
  id: string;
  nickname: string;
  seat: number;
  type: "human" | "bot";
  botDifficulty?: string;
  sessionId?: string;
  connected: boolean;
  ready: boolean;
  host: boolean;
};

export function syncNinetyNinePublicState(
  schema: NinetyNineRoomStateSchema,
  state: NinetyNineState | null,
  lobbyPlayers: LobbyNinetyNinePlayer[],
  turnDeadline = 0
) {
  schema.phase = state?.phase ?? "waiting";
  schema.currentTotal = state?.currentTotal ?? 0;
  schema.currentPlayerId = state?.currentPlayerId ?? "";
  schema.direction = state?.direction ?? 1;
  schema.turnNumber = state?.turnNumber ?? 0;
  schema.turnDeadline = turnDeadline;
  schema.drawPileCount = state?.drawPile.length ?? 0;
  schema.discardPileCount = state?.discardPile.length ?? 0;
  schema.winnerId = state?.winnerId ?? "";
  schema.lastEffect = state?.lastAction?.effectLabel ?? "";
  schema.lastSystemAction = state?.lastAction?.system ?? false;
  applyLastCard(schema.lastCard, state?.lastAction?.card ?? null);
  schema.players.clear();

  const players = state
    ? state.players.map((player) => {
        const lobby = lobbyPlayers.find((item) => item.id === player.id);
        return {
          id: player.id,
          nickname: player.nickname,
          seat: player.seat,
          type: player.type,
          status: player.status,
          connected: player.type === "bot" || Boolean(lobby?.connected),
          ready: true,
          cardsRemaining: state.hands[player.id]?.length ?? 0,
          botDifficulty: player.botDifficulty ?? "",
          host: Boolean(lobby?.host)
        };
      })
    : lobbyPlayers;

  players
    .slice()
    .sort((left, right) => left.seat - right.seat)
    .forEach((player) => {
      const publicPlayer = new PublicNinetyNinePlayer();
      publicPlayer.id = player.id;
      publicPlayer.nickname = player.nickname;
      publicPlayer.seat = player.seat;
      publicPlayer.type = player.type;
      publicPlayer.status = "status" in player ? player.status : "waiting";
      publicPlayer.connected = player.connected;
      publicPlayer.ready = player.type === "bot" || player.ready;
      publicPlayer.cardsRemaining = "cardsRemaining" in player ? player.cardsRemaining : 0;
      publicPlayer.botDifficulty = player.botDifficulty ?? "";
      publicPlayer.host = player.host;
      schema.players.push(publicPlayer);
    });
}

function applyLastCard(target: PublicNinetyNineCard, card: { id: string; rank: string; suit: string } | null) {
  target.id = card?.id ?? "";
  target.rank = card?.rank ?? "";
  target.suit = card?.suit ?? "";
}

