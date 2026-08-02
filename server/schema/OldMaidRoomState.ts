import { ArraySchema, Schema, defineTypes } from "@colyseus/schema";
import type { OldMaidState } from "../../lib/games/old-maid";

export type OldMaidRoomPhase =
  | "waiting"
  | "shuffling"
  | "dealing"
  | "revealing"
  | "organizing"
  | "ready"
  | "playing"
  | "finished";

export class PublicOldMaidPlayer extends Schema {
  id = "";
  nickname = "";
  seat = 0;
  status = "waiting";
  connected = true;
  ready = false;
  cardsRemaining = 0;
  host = false;
}

defineTypes(PublicOldMaidPlayer, {
  id: "string",
  nickname: "string",
  seat: "number",
  status: "string",
  connected: "boolean",
  ready: "boolean",
  cardsRemaining: "number",
  host: "boolean"
});

export class OldMaidRoomStateSchema extends Schema {
  roomCode = "";
  phase = "waiting";
  maxPlayers = 4;
  round = 1;
  dealerPlayerId = "";
  currentPlayerId = "";
  targetPlayerId = "";
  turnNumber = 0;
  turnDeadline = 0;
  phaseStartedAt = 0;
  phaseDeadline = 0;
  loserId = "";
  players = new ArraySchema<PublicOldMaidPlayer>();
}

defineTypes(OldMaidRoomStateSchema, {
  roomCode: "string",
  phase: "string",
  maxPlayers: "number",
  round: "number",
  dealerPlayerId: "string",
  currentPlayerId: "string",
  targetPlayerId: "string",
  turnNumber: "number",
  turnDeadline: "number",
  phaseStartedAt: "number",
  phaseDeadline: "number",
  loserId: "string",
  players: [PublicOldMaidPlayer]
});

export type LobbyOldMaidPlayer = {
  id: string;
  nickname: string;
  seat: number;
  sessionId?: string;
  clientId?: string;
  connected: boolean;
  ready: boolean;
  host: boolean;
};

export function syncOldMaidPublicState(
  schema: OldMaidRoomStateSchema,
  state: OldMaidState | null,
  lobbyPlayers: LobbyOldMaidPlayer[],
  turnDeadline = 0,
  presentation?: {
    phase: OldMaidRoomPhase;
    phaseStartedAt: number;
    phaseDeadline: number;
    hands?: Readonly<Record<string, readonly unknown[]>>;
  }
) {
  const phase = presentation?.phase ?? state?.phase ?? "waiting";
  const isPlaying = phase === "playing";
  const isOpening = [
    "shuffling",
    "dealing",
    "revealing",
    "organizing",
    "ready"
  ].includes(phase);

  schema.phase = phase;
  schema.dealerPlayerId = state?.dealerPlayerId ?? "";
  schema.currentPlayerId = isPlaying ? state?.currentPlayerId ?? "" : "";
  schema.targetPlayerId = isPlaying ? state?.targetPlayerId ?? "" : "";
  schema.turnNumber = isPlaying ? state?.turnNumber ?? 0 : 0;
  schema.turnDeadline = isPlaying ? turnDeadline : 0;
  schema.phaseStartedAt = presentation?.phaseStartedAt ?? 0;
  schema.phaseDeadline = presentation?.phaseDeadline ?? 0;
  schema.loserId = state?.loserId ?? "";

  const players = state
    ? state.players.map((player) => {
        const lobby = lobbyPlayers.find((item) => item.id === player.id);
        return {
          id: player.id,
          nickname: player.nickname,
          seat: player.seat,
          status: player.status,
          connected: Boolean(lobby?.connected),
          ready: true,
          cardsRemaining: isOpening
            ? presentation?.hands?.[player.id]?.length ?? 0
            : state.hands[player.id]?.length ?? 0,
          host: Boolean(lobby?.host)
        };
      })
    : lobbyPlayers.map((player) => ({
        ...player,
        status: "waiting",
        cardsRemaining: 0
      }));

  const sortedPlayers = players
    .slice()
    .sort((left, right) => left.seat - right.seat);

  while (schema.players.length > sortedPlayers.length) {
    schema.players.pop();
  }
  sortedPlayers.forEach((player, index) => {
    const publicPlayer = schema.players[index] ?? new PublicOldMaidPlayer();
    publicPlayer.id = player.id;
    publicPlayer.nickname = player.nickname;
    publicPlayer.seat = player.seat;
    publicPlayer.status = player.status;
    publicPlayer.connected = player.connected;
    publicPlayer.ready = player.ready;
    publicPlayer.cardsRemaining = player.cardsRemaining;
    publicPlayer.host = player.host;
    if (!schema.players[index]) schema.players.push(publicPlayer);
  });
}
