import { ArraySchema, Schema, defineTypes } from "@colyseus/schema";
import type { BluffCard, BluffState } from "../../lib/games/bluff";

export class PublicBluffPlayer extends Schema {
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

defineTypes(PublicBluffPlayer, {
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

export class PublicBluffCard extends Schema {
  id = "";
  rank = "";
  suit = "";
}

defineTypes(PublicBluffCard, {
  id: "string",
  rank: "string",
  suit: "string"
});

export class BluffRoomStateSchema extends Schema {
  roomCode = "";
  phase = "waiting";
  maxPlayers = 4;
  round = 1;
  currentPlayerId = "";
  turnNumber = 0;
  turnDeadline = 0;
  reactionDeadline = 0;
  centerPileCount = 0;
  discardPileCount = 0;
  roundClaimRank = "";
  roundClaimCount = 0;
  lastBatchPlayerId = "";
  lastBatchId = "";
  notice = "";
  winnerId = "";
  players = new ArraySchema<PublicBluffPlayer>();
  revealedCards = new ArraySchema<PublicBluffCard>();
}

defineTypes(BluffRoomStateSchema, {
  roomCode: "string",
  phase: "string",
  maxPlayers: "number",
  round: "number",
  currentPlayerId: "string",
  turnNumber: "number",
  turnDeadline: "number",
  reactionDeadline: "number",
  centerPileCount: "number",
  discardPileCount: "number",
  roundClaimRank: "string",
  roundClaimCount: "number",
  lastBatchPlayerId: "string",
  lastBatchId: "string",
  notice: "string",
  winnerId: "string",
  players: [PublicBluffPlayer],
  revealedCards: [PublicBluffCard]
});

export type LobbyBluffPlayer = {
  id: string;
  nickname: string;
  seat: number;
  type: "human" | "bot";
  botDifficulty?: string;
  sessionId?: string;
  clientId?: string;
  connected: boolean;
  ready: boolean;
  host: boolean;
};

export function syncBluffPublicState(
  schema: BluffRoomStateSchema,
  state: BluffState | null,
  lobbyPlayers: LobbyBluffPlayer[],
  turnDeadline = 0,
  reactionDeadline = 0
) {
  schema.phase = state?.phase ?? "waiting";
  schema.currentPlayerId = state?.currentPlayerId ?? "";
  schema.turnNumber = state?.turnNumber ?? 0;
  schema.turnDeadline = turnDeadline;
  schema.reactionDeadline = reactionDeadline;
  schema.centerPileCount = state?.centerPile.length ?? 0;
  schema.discardPileCount = state?.discardPile.length ?? 0;
  schema.roundClaimRank = state?.roundClaimRank ?? "";
  schema.roundClaimCount = state?.roundClaimCount ?? 0;
  schema.lastBatchId = state?.lastBatchId ?? "";
  schema.lastBatchPlayerId = state?.batches.at(-1)?.playerId ?? "";
  schema.notice = createNotice(state, lobbyPlayers);
  schema.winnerId = state?.winnerId ?? "";
  schema.revealedCards.clear();
  state?.roundResult?.revealedCards.forEach((card) => schema.revealedCards.push(toPublicCard(card)));
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
      const publicPlayer = new PublicBluffPlayer();
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

function toPublicCard(card: BluffCard) {
  const publicCard = new PublicBluffCard();
  publicCard.id = card.id;
  publicCard.rank = card.rank;
  publicCard.suit = card.suit ?? "joker";
  return publicCard;
}

function createNotice(state: BluffState | null, lobbyPlayers: LobbyBluffPlayer[]) {
  if (!state) return "";
  if (state.roundResult?.message) return state.roundResult.message;
  const batch = state.batches.at(-1);
  if (!batch || state.phase !== "reaction-window") return "";
  const playerName = state.players.find((player) => player.id === batch.playerId)?.nickname
    ?? lobbyPlayers.find((player) => player.id === batch.playerId)?.nickname
    ?? "玩家";
  const isOpeningPlay = state.centerPile.length === batch.addedCount;
  return isOpeningPlay
    ? `${playerName} 出了 ${batch.addedCount} 張 ${batch.claimedRank}`
    : `${playerName} 加 ${batch.addedCount} 張`;
}
