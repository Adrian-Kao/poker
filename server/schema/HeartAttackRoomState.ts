import { ArraySchema, MapSchema, Schema, defineTypes } from "@colyseus/schema";
import type { HeartAttackState, PenaltyResult, PlayedCard } from "../../lib/games/heart-attack";

export class PublicHeartAttackPlayer extends Schema {
  id = "";
  nickname = "";
  seat = 0;
  type = "human";
  status = "playing";
  connected = true;
  ready = false;
  cardsRemaining = 0;
}

defineTypes(PublicHeartAttackPlayer, {
  id: "string",
  nickname: "string",
  seat: "number",
  type: "string",
  status: "string",
  connected: "boolean",
  ready: "boolean",
  cardsRemaining: "number"
});

export class PublicPlayedCardState extends Schema {
  id = "";
  rank = "";
  suit = "";
  playedBy = "";
  calledNumber = 1;
  playedAt = 0;
}

defineTypes(PublicPlayedCardState, {
  id: "string",
  rank: "string",
  suit: "string",
  playedBy: "string",
  calledNumber: "number",
  playedAt: "number"
});

export class PublicPenaltyNoticeState extends Schema {
  id = "";
  reason = "";
  playerId = "";
  playerName = "";
  collectedCards = 0;
  createdAt = 0;
  displayUntil = 0;
}

defineTypes(PublicPenaltyNoticeState, {
  id: "string",
  reason: "string",
  playerId: "string",
  playerName: "string",
  collectedCards: "number",
  createdAt: "number",
  displayUntil: "number"
});

export class HeartAttackRoomStateSchema extends Schema {
  roomCode = "";
  phase = "waiting";
  maxPlayers = 4;
  round = 1;
  currentPlayerId = "";
  callNumber = 1;
  centerPileCount = 0;
  turnNumber = 0;
  slapDeadline = 0;
  nextAutoPlayAt = 0;
  winnerId = "";
  players = new ArraySchema<PublicHeartAttackPlayer>();
  lastCard = new PublicPlayedCardState();
  penaltyNotice = new PublicPenaltyNoticeState();
  connectedSessions = new MapSchema<string>();
}

defineTypes(HeartAttackRoomStateSchema, {
  roomCode: "string",
  phase: "string",
  maxPlayers: "number",
  round: "number",
  currentPlayerId: "string",
  callNumber: "number",
  centerPileCount: "number",
  turnNumber: "number",
  slapDeadline: "number",
  nextAutoPlayAt: "number",
  winnerId: "string",
  players: [PublicHeartAttackPlayer],
  lastCard: PublicPlayedCardState,
  penaltyNotice: PublicPenaltyNoticeState,
  connectedSessions: { map: "string" }
});

export function syncPublicState(schema: HeartAttackRoomStateSchema, state: HeartAttackState | null, connectedPlayerIds = new Set<string>()) {
  if (!state) {
    schema.phase = "waiting";
    schema.currentPlayerId = "";
    schema.callNumber = 1;
    schema.centerPileCount = 0;
    schema.turnNumber = 0;
    schema.slapDeadline = 0;
    schema.nextAutoPlayAt = 0;
    schema.winnerId = "";
    applyLastCard(schema.lastCard, null);
    applyPenalty(schema.penaltyNotice, null);
    return;
  }

  schema.phase = state.phase;
  schema.currentPlayerId = state.currentPlayerId ?? "";
  schema.callNumber = state.callNumber;
  schema.centerPileCount = state.centerPile.length;
  schema.turnNumber = state.turnNumber;
  schema.slapDeadline = state.slapDeadline ?? 0;
  schema.nextAutoPlayAt = state.nextAutoPlayAt ?? 0;
  schema.winnerId = state.winnerId ?? "";
  schema.players.clear();

  state.players
    .slice()
    .sort((left, right) => left.seat - right.seat)
    .forEach((player) => {
      const publicPlayer = new PublicHeartAttackPlayer();
      publicPlayer.id = player.id;
      publicPlayer.nickname = player.nickname;
      publicPlayer.seat = player.seat;
      publicPlayer.type = player.type;
      publicPlayer.status = player.status;
      publicPlayer.connected = player.type === "bot" || connectedPlayerIds.has(player.id);
      publicPlayer.ready = true;
      publicPlayer.cardsRemaining = state.playerDecks[player.id]?.length ?? 0;
      schema.players.push(publicPlayer);
    });

  const lastCard = state.centerPile.at(-1) ?? null;
  applyLastCard(schema.lastCard, lastCard);
  applyPenalty(schema.penaltyNotice, state.penaltyResult);
}

function applyLastCard(target: PublicPlayedCardState, played: PlayedCard | null) {
  target.id = played?.card.id ?? "";
  target.rank = played?.card.rank ?? "";
  target.suit = played?.card.suit ?? "";
  target.playedBy = played?.playedBy ?? "";
  target.calledNumber = played?.calledNumber ?? 1;
  target.playedAt = played?.playedAt ?? 0;
}

function applyPenalty(target: PublicPenaltyNoticeState, penalty: PenaltyResult | null) {
  target.id = penalty ? `${penalty.occurredAt}-${penalty.playerId}-${penalty.reason}` : "";
  target.reason = penalty?.reason ?? "";
  target.playerId = penalty?.playerId ?? "";
  target.playerName = penalty?.playerName ?? "";
  target.collectedCards = penalty?.cardsTaken ?? 0;
  target.createdAt = penalty?.occurredAt ?? 0;
  target.displayUntil = penalty ? penalty.occurredAt + 5000 : 0;
}
