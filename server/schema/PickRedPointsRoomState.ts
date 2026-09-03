import { ArraySchema, Schema, defineTypes } from "@colyseus/schema";
import { calculatePickRedScoreAdjustments, type PickRedPointsState } from "../../lib/games/pick-red-points";

export class PublicPickRedPlayer extends Schema {
  id = ""; nickname = ""; seat = 0; type = "human"; status = "playing"; connected = true; ready = false; cardsRemaining = 0; capturedCount = 0; score = 0; scoreAdjustment = 0; matchPoints = 0; botDifficulty = ""; host = false;
}
defineTypes(PublicPickRedPlayer, { id: "string", nickname: "string", seat: "number", type: "string", status: "string", connected: "boolean", ready: "boolean", cardsRemaining: "number", capturedCount: "number", score: "number", scoreAdjustment: "number", matchPoints: "number", botDifficulty: "string", host: "boolean" });

export class PublicPickRedCard extends Schema { id = ""; rank = ""; suit = ""; }
defineTypes(PublicPickRedCard, { id: "string", rank: "string", suit: "string" });

export class PickRedPointsRoomStateSchema extends Schema {
  roomCode = ""; phase = "waiting"; maxPlayers = 4; round = 1; totalRounds = 1; matchMode = "single"; currentPlayerId = ""; selectedStartingPlayerId = ""; tailPlayerId = ""; turnNumber = 0; turnDeadline = 0; targetDeadline = 0; legalTargetIds = ""; drawPileCount = 0; lastResult = ""; winners = ""; blackHandEligiblePlayerIds = ""; blackHandPendingPlayerIds = ""; revealedBlackHandPlayerId = ""; pendingCard: PublicPickRedCard | null = null; players = new ArraySchema<PublicPickRedPlayer>(); tableCards = new ArraySchema<PublicPickRedCard>(); revealedBlackHandCards = new ArraySchema<PublicPickRedCard>();
}
defineTypes(PickRedPointsRoomStateSchema, { roomCode: "string", phase: "string", maxPlayers: "number", round: "number", totalRounds: "number", matchMode: "string", currentPlayerId: "string", selectedStartingPlayerId: "string", tailPlayerId: "string", turnNumber: "number", turnDeadline: "number", targetDeadline: "number", legalTargetIds: "string", drawPileCount: "number", lastResult: "string", winners: "string", blackHandEligiblePlayerIds: "string", blackHandPendingPlayerIds: "string", revealedBlackHandPlayerId: "string", pendingCard: PublicPickRedCard, players: [PublicPickRedPlayer], tableCards: [PublicPickRedCard], revealedBlackHandCards: [PublicPickRedCard] });

export type LobbyPickRedPlayer = { id: string; nickname: string; seat: number; type: "human" | "bot"; botDifficulty?: string; sessionId?: string; clientId?: string; connected: boolean; ready: boolean; host: boolean };

export function syncPickRedPublicState(schema: PickRedPointsRoomStateSchema, state: PickRedPointsState | null, lobbyPlayers: LobbyPickRedPlayer[], turnDeadline = 0, selectedStartingPlayerId = "", gameNumber = 1, totalRounds = 1, matchMode = "single", tailPlayerId = "", matchPoints: Record<string, number> = {}) {
  const scoreAdjustments = state && state.phase !== "finished" ? calculatePickRedScoreAdjustments(state.capturedCards, state.players.map((player) => player.id)) : {};
  schema.phase = state?.phase ?? "waiting";
  schema.currentPlayerId = state?.currentPlayerId ?? "";
  schema.selectedStartingPlayerId = state?.startingPlayerId ?? selectedStartingPlayerId;
  schema.tailPlayerId = tailPlayerId;
  schema.round = gameNumber;
  schema.totalRounds = totalRounds;
  schema.matchMode = matchMode;
  schema.turnNumber = state?.turnNumber ?? 0;
  schema.turnDeadline = turnDeadline;
  schema.targetDeadline = state?.targetDeadline ?? 0;
  schema.legalTargetIds = state?.legalTargetIds.join(",") ?? "";
  schema.drawPileCount = state?.drawPile.length ?? 0;
  schema.lastResult = state?.lastResult ?? "";
  schema.winners = state?.winners.join(",") ?? "";
  schema.blackHandEligiblePlayerIds = state?.blackHandEligiblePlayerIds.join(",") ?? "";
  schema.blackHandPendingPlayerIds = state?.blackHandPendingPlayerIds.join(",") ?? "";
  schema.revealedBlackHandPlayerId = state?.revealedBlackHandPlayerId ?? "";
  schema.pendingCard = state?.pendingCard ? Object.assign(new PublicPickRedCard(), state.pendingCard.card) : null;
  schema.players.clear(); schema.tableCards.clear(); schema.revealedBlackHandCards.clear();
  (state ? state.players.map((player) => ({ ...player, ready: true, cardsRemaining: state.hands[player.id]?.length ?? 0, capturedCount: state.capturedCards[player.id]?.length ?? 0, score: state.scores[player.id] ?? 0, scoreAdjustment: scoreAdjustments[player.id] ?? 0, matchPoints: matchPoints[player.id] ?? 0, connected: player.type === "bot" || Boolean(lobbyPlayers.find((item) => item.id === player.id)?.connected), host: Boolean(lobbyPlayers.find((item) => item.id === player.id)?.host) })) : lobbyPlayers).sort((left, right) => left.seat - right.seat).forEach((player) => {
    const target = new PublicPickRedPlayer(); Object.assign(target, { id: player.id, nickname: player.nickname, seat: player.seat, type: player.type, status: "status" in player ? player.status : "waiting", connected: player.connected, ready: player.type === "bot" || player.ready, cardsRemaining: "cardsRemaining" in player ? player.cardsRemaining : 0, capturedCount: "capturedCount" in player ? player.capturedCount : 0, score: "score" in player ? player.score : 0, scoreAdjustment: "scoreAdjustment" in player ? player.scoreAdjustment : 0, matchPoints: "matchPoints" in player ? player.matchPoints : matchPoints[player.id] ?? 0, botDifficulty: player.botDifficulty ?? "", host: player.host }); schema.players.push(target);
  });
  state?.tableCards.forEach((item) => { const target = new PublicPickRedCard(); target.id = item.card.id; target.rank = item.card.rank; target.suit = item.card.suit; schema.tableCards.push(target); });
  state?.revealedBlackHandCards.forEach((card) => { const target = new PublicPickRedCard(); target.id = card.id; target.rank = card.rank; target.suit = card.suit; schema.revealedBlackHandCards.push(target); });
}
