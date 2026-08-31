import { ArraySchema, Schema, defineTypes } from "@colyseus/schema";
import { calculateClassicScore, type SevensState } from "../../lib/games/sevens";

export class PublicSevensPlayer extends Schema {
  id = "";
  nickname = "";
  seat = 0;
  type = "human";
  status = "waiting";
  connected = true;
  ready = false;
  handCount = 0;
  coveredCount = 0;
  coveredPoints = 0;
  botDifficulty = "";
  host = false;
}
defineTypes(PublicSevensPlayer, {
  id: "string", nickname: "string", seat: "number", type: "string", status: "string",
  connected: "boolean", ready: "boolean", handCount: "number", coveredCount: "number",
  coveredPoints: "number", botDifficulty: "string", host: "boolean"
});

export class PublicSevensCard extends Schema {
  id = "";
  rank = "";
  suit = "";
  deckIndex = 0;
  playerId = "";
  turnNumber = 0;
}
defineTypes(PublicSevensCard, {
  id: "string", rank: "string", suit: "string", deckIndex: "number",
  playerId: "string", turnNumber: "number"
});

export class PublicSevensStanding extends Schema {
  playerId = "";
  nickname = "";
  rank = 0;
  coveredCount = 0;
  coveredPoints = -1;
  turnOrderIndex = 0;
  finishOrderIndex = -1;
}
defineTypes(PublicSevensStanding, {
  playerId: "string", nickname: "string", rank: "number", coveredCount: "number",
  coveredPoints: "number", turnOrderIndex: "number", finishOrderIndex: "number"
});

export class SevensRoomStateSchema extends Schema {
  roomCode = "";
  phase = "waiting";
  mode = "classic-four";
  maxPlayers = 4;
  round = 1;
  direction = "counterclockwise";
  currentPlayerId = "";
  startingPlayerId = "";
  turnNumber = 0;
  winnerId = "";
  notice = "等待玩家準備";
  players = new ArraySchema<PublicSevensPlayer>();
  tableauCards = new ArraySchema<PublicSevensCard>();
  standings = new ArraySchema<PublicSevensStanding>();
}
defineTypes(SevensRoomStateSchema, {
  roomCode: "string", phase: "string", mode: "string", maxPlayers: "number", round: "number",
  direction: "string", currentPlayerId: "string", startingPlayerId: "string", turnNumber: "number",
  winnerId: "string", notice: "string", players: [PublicSevensPlayer],
  tableauCards: [PublicSevensCard], standings: [PublicSevensStanding]
});

export type LobbySevensPlayer = {
  id: string;
  nickname: string;
  seat: number;
  type: "human" | "bot";
  botDifficulty?: "easy" | "normal" | "hard";
  sessionId?: string;
  clientId?: string;
  connected: boolean;
  ready: boolean;
  host: boolean;
};

export function syncSevensPublicState(
  schema: SevensRoomStateSchema,
  state: SevensState | null,
  lobby: LobbySevensPlayer[]
) {
  schema.phase = state?.phase ?? "waiting";
  schema.direction = state?.direction ?? (schema.mode === "classic-four" ? "counterclockwise" : "clockwise");
  schema.currentPlayerId = state?.currentPlayerId ?? "";
  schema.startingPlayerId = state?.startingPlayerId ?? "";
  schema.turnNumber = state?.turnNumber ?? 0;
  schema.winnerId = state?.winnerId ?? "";
  schema.notice = createNotice(state, lobby);

  schema.players.clear();
  const players = state
    ? state.players.map((player) => {
        const source = lobby.find((item) => item.id === player.id);
        return {
          ...player,
          connected: player.type === "bot" || Boolean(source?.connected),
          ready: true,
          host: Boolean(source?.host),
          handCount: state.hands[player.id]?.length ?? 0,
          coveredCount: state.coveredCards[player.id]?.length ?? 0,
          coveredPoints: calculateClassicScore(state.coveredCards[player.id] ?? [])
        };
      })
    : lobby.map((player) => ({ ...player, status: "waiting", handCount: 0, coveredCount: 0, coveredPoints: 0 }));

  players.sort((a, b) => a.seat - b.seat).forEach((player) => {
    const next = new PublicSevensPlayer();
    next.id = player.id;
    next.nickname = player.nickname;
    next.seat = player.seat;
    next.type = player.type;
    next.status = player.status;
    next.connected = player.connected;
    next.ready = player.type === "bot" || player.ready;
    next.handCount = player.handCount;
    next.coveredCount = player.coveredCount;
    next.coveredPoints = player.coveredPoints;
    next.botDifficulty = player.botDifficulty ?? "";
    next.host = player.host;
    schema.players.push(next);
  });

  schema.tableauCards.clear();
  if (state) {
    Object.values(state.tableau).forEach((row) => {
      Object.values(row).forEach((card) => {
        if (!card) return;
        const next = new PublicSevensCard();
        next.id = card.id;
        next.rank = card.rank;
        next.suit = card.suit;
        next.deckIndex = card.deckIndex;
        next.playerId = card.playerId;
        next.turnNumber = card.turnNumber;
        schema.tableauCards.push(next);
      });
    });
  }

  schema.standings.clear();
  state?.standings?.forEach((standing) => {
    const next = new PublicSevensStanding();
    next.playerId = standing.playerId;
    next.nickname = standing.nickname;
    next.rank = standing.rank;
    next.coveredCount = standing.coveredCount;
    next.coveredPoints = standing.coveredPoints ?? -1;
    next.turnOrderIndex = standing.turnOrderIndex;
    next.finishOrderIndex = standing.finishOrderIndex;
    schema.standings.push(next);
  });
}

function createNotice(state: SevensState | null, lobby: LobbySevensPlayer[]) {
  if (!state) return "等待玩家準備";
  if (state.phase === "finished") {
    const winner = lobby.find((player) => player.id === state.winnerId)?.nickname ?? "玩家";
    return `${winner} 已經出完手牌`;
  }
  if (!state.lastAction) return "持有黑桃 7 的玩家先出牌";
  const player = lobby.find((item) => item.id === state.lastAction?.playerId)?.nickname ?? "玩家";
  return state.lastAction.type === "PLAY_CARD" ? `${player} 打出一張牌` : `${player} 蓋了一張牌`;
}
