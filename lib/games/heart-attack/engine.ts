import { createStandardDeck } from "../core/cards";
import { createSeededRandom, shuffle, type RandomSource } from "../core/random";
import { AUTO_PLAY_INTERVAL_MS, HEART_ATTACK_HAND_SIZE, ROUND_RESULT_DISPLAY_MS, SLAP_WINDOW_MS } from "./constants";
import { getNextCallNumber, isSlapTrigger } from "./actions";
import type {
  CreateHeartAttackPlayerInput,
  HeartAttackAction,
  HeartAttackCard,
  HeartAttackState,
  PenaltyReason,
  PlayedCard
} from "./types";

export type CreateHeartAttackGameOptions = {
  players: CreateHeartAttackPlayerInput[];
  seed?: number;
  random?: RandomSource;
  initialTimestamp?: number;
};

export function createHeartAttackGame(options: CreateHeartAttackGameOptions): HeartAttackState {
  if (options.players.length < 3) throw new Error("Heart attack requires at least 3 players.");

  const ids = new Set(options.players.map((player) => player.id));
  if (ids.size !== options.players.length) throw new Error("Player ids must be unique.");

  const random = options.random ?? createSeededRandom(options.seed ?? Date.now());
  const deck = buildHeartAttackDeck(options.players.length, random);
  const playerDecks: Record<string, HeartAttackCard[]> = {};

  options.players.forEach((player, index) => {
    playerDecks[player.id] = deck.slice(index * HEART_ATTACK_HAND_SIZE, (index + 1) * HEART_ATTACK_HAND_SIZE);
  });

  const initialTimestamp = options.initialTimestamp ?? 0;

  return {
    phase: "playing",
    players: options.players.map((player, index) => ({
      id: player.id,
      nickname: player.nickname,
      seat: index,
      type: player.type ?? "human",
      botDifficulty: player.botDifficulty,
      status: "playing"
    })),
    playerDecks,
    centerPile: [],
    currentPlayerId: options.players[0].id,
    callNumber: 1,
    slapResponses: [],
    slapDeadline: null,
    roundResult: null,
    penaltyResult: null,
    winnerId: null,
    turnNumber: 1,
    autoPlayIntervalMs: AUTO_PLAY_INTERVAL_MS,
    nextAutoPlayAt: initialTimestamp + AUTO_PLAY_INTERVAL_MS,
    isAutoPlayPaused: false
  };
}

export function buildHeartAttackDeck(playerCount: number, random: RandomSource): HeartAttackCard[] {
  const cardsNeeded = playerCount * HEART_ATTACK_HAND_SIZE;
  const deckCount = Math.ceil(cardsNeeded / 54);
  const decks: HeartAttackCard[] = [];

  for (let deckIndex = 1; deckIndex <= deckCount; deckIndex += 1) {
    decks.push(
      ...createStandardDeck().map((card) => ({ ...card, id: `deck-${deckIndex}-${card.suit}-${card.rank}`, deckIndex })),
      { id: `deck-${deckIndex}-joker-red`, deckIndex, suit: null, rank: "JOKER" },
      { id: `deck-${deckIndex}-joker-black`, deckIndex, suit: null, rank: "JOKER" }
    );
  }

  return shuffle(decks, random).slice(0, cardsNeeded);
}

export function applyHeartAttackAction(state: HeartAttackState, action: HeartAttackAction): HeartAttackState {
  if (action.type === "AUTO_PLAY_TICK") return advanceAutoPlay(state, action.timestamp);
  if (action.type !== "SLAP") throw new Error("Unsupported heart attack action.");
  return submitSlap(state, action.playerId, action.timestamp);
}

export function advanceAutoPlay(state: HeartAttackState, timestamp: number): HeartAttackState {
  if (state.isAutoPlayPaused || state.phase === "finished" || state.phase === "slap-window") return state;
  if (state.nextAutoPlayAt === null || timestamp < state.nextAutoPlayAt) return state;

  if (state.phase === "round-result") {
    return resumeAfterRoundResult(state, timestamp);
  }

  if (state.phase !== "playing" || !state.currentPlayerId) return state;

  return autoPlayTopCard(state, state.currentPlayerId, timestamp);
}

export function submitSlap(state: HeartAttackState, playerId: string, timestamp: number): HeartAttackState {
  if (!state.players.some((player) => player.id === playerId)) throw new Error("Unknown player.");
  if (state.phase === "round-result" || state.phase === "finished") return state;

  const latest = state.centerPile.at(-1) ?? null;
  const valid = state.phase === "slap-window" && latest !== null && timestamp <= (state.slapDeadline ?? -1);
  const response = { playerId, timestamp, valid };

  if (!valid) {
    const pile = state.centerPile;
    return {
      ...state,
      phase: "round-result",
      playerDecks: givePileToPlayer(state.playerDecks, playerId, pile),
      centerPile: [],
      slapResponses: [...state.slapResponses, response],
      slapDeadline: null,
      nextAutoPlayAt: timestamp + ROUND_RESULT_DISPLAY_MS,
      penaltyResult: createPenaltyResult(state, "false-slap", playerId, pile, timestamp, latest),
      roundResult: {
        trigger: latest,
        winnerId: null,
        penaltyPlayerId: playerId,
        collectedCardCount: pile.length,
        reason: "false-slap"
      }
    };
  }

  return {
    ...state,
    slapResponses: [...state.slapResponses, response]
  };
}

export function resolveSlapWindow(state: HeartAttackState, timestamp: number): HeartAttackState {
  if (state.phase !== "slap-window") return state;
  if (state.slapDeadline !== null && timestamp < state.slapDeadline) return state;

  const trigger = state.centerPile.at(-1) ?? null;
  const slowest = getSlowestValidSlap(state.slapResponses);
  const penaltyPlayerId = slowest?.playerId ?? trigger?.playedBy ?? state.currentPlayerId;
  const pile = state.centerPile;

  if (!penaltyPlayerId) return state;
  const reason = getPenaltyReason(state, penaltyPlayerId, slowest ? "slowest-slap" : "no-slap");

  return {
    ...state,
    phase: "round-result",
    playerDecks: givePileToPlayer(state.playerDecks, penaltyPlayerId, pile),
    centerPile: [],
    slapDeadline: null,
    nextAutoPlayAt: timestamp + ROUND_RESULT_DISPLAY_MS,
    penaltyResult: createPenaltyResult(state, reason, penaltyPlayerId, pile, timestamp, trigger, slowest?.timestamp ?? null),
    roundResult: {
      trigger,
      winnerId: null,
      penaltyPlayerId,
      collectedCardCount: pile.length,
      reason
    }
  };
}

export function resolveRoundResult(state: HeartAttackState, timestamp: number): HeartAttackState {
  if (state.phase !== "round-result") return state;
  if (state.nextAutoPlayAt !== null && timestamp < state.nextAutoPlayAt) return state;
  return resumeAfterRoundResult(state, timestamp);
}

export function getNextPlayablePlayer(state: HeartAttackState, fromPlayerId = state.currentPlayerId): string | null {
  if (!fromPlayerId) return null;
  const ordered = [...state.players].sort((left, right) => left.seat - right.seat);
  const startIndex = ordered.findIndex((player) => player.id === fromPlayerId);
  if (startIndex === -1) return null;

  for (let offset = 1; offset <= ordered.length; offset += 1) {
    const player = ordered[(startIndex + offset) % ordered.length];
    if (player.status === "pendingFinish") return player.id;
    if (player.status === "playing" && (state.playerDecks[player.id]?.length ?? 0) > 0) return player.id;
  }

  return null;
}

export const getNextPlayer = getNextPlayablePlayer;

export function getHeartAttackWinner(state: HeartAttackState) {
  return state.winnerId;
}

function autoPlayTopCard(state: HeartAttackState, playerId: string, timestamp: number): HeartAttackState {
  const player = state.players.find((item) => item.id === playerId);
  if (!player || player.status === "winner") throw new Error("Player cannot act.");

  if (player.status === "pendingFinish") return finishGame(state, playerId);

  const deck = state.playerDecks[playerId] ?? [];
  if (deck.length === 0) return finishGame(state, playerId);

  const [card, ...remainingDeck] = deck;
  const playedCard: PlayedCard = { card, playedBy: playerId, calledNumber: state.callNumber, playedAt: timestamp };
  const trigger = isSlapTrigger(card, state.callNumber);
  const players = remainingDeck.length === 0
    ? state.players.map((item) => (item.id === playerId ? { ...item, status: "pendingFinish" as const } : item))
    : state.players;
  const baseState: HeartAttackState = {
    ...state,
    players,
    playerDecks: { ...state.playerDecks, [playerId]: remainingDeck },
    centerPile: [...state.centerPile, playedCard],
    callNumber: getNextCallNumber(state.callNumber),
    slapResponses: [],
    roundResult: null,
    penaltyResult: null,
    turnNumber: state.turnNumber + 1
  };

  if (trigger) {
    return { ...baseState, phase: "slap-window", slapDeadline: timestamp + SLAP_WINDOW_MS, nextAutoPlayAt: null };
  }

  const nextPlayerId = getNextPlayablePlayer(baseState, playerId);
  return {
    ...finishIfPending(baseState, nextPlayerId),
    slapDeadline: null,
    nextAutoPlayAt: timestamp + state.autoPlayIntervalMs
  };
}

function resumeAfterRoundResult(state: HeartAttackState, timestamp: number): HeartAttackState {
  const nextPlayerId = state.currentPlayerId ?? getNextPlayablePlayer(state);
  const resumed = finishIfPending({ ...state, phase: "playing", roundResult: state.roundResult, penaltyResult: null }, nextPlayerId);
  if (resumed.phase === "finished") return resumed;
  return { ...resumed, currentPlayerId: nextPlayerId, nextAutoPlayAt: timestamp + state.autoPlayIntervalMs };
}

function finishIfPending(state: HeartAttackState, nextPlayerId: string | null): HeartAttackState {
  if (!nextPlayerId) return { ...state, phase: "finished", currentPlayerId: null, nextAutoPlayAt: null };
  const player = state.players.find((item) => item.id === nextPlayerId);
  if (player?.status === "pendingFinish") return finishGame(state, nextPlayerId);
  return { ...state, phase: "playing", currentPlayerId: nextPlayerId };
}

function finishGame(state: HeartAttackState, winnerId: string): HeartAttackState {
  return {
    ...state,
    phase: "finished",
    currentPlayerId: null,
    winnerId,
    nextAutoPlayAt: null,
    players: state.players.map((player) => (player.id === winnerId ? { ...player, status: "winner" } : player))
  };
}

function givePileToPlayer(playerDecks: Record<string, HeartAttackCard[]>, playerId: string, pile: PlayedCard[]) {
  return { ...playerDecks, [playerId]: [...(playerDecks[playerId] ?? []), ...pile.map((played) => played.card)] };
}

function getSlowestValidSlap(responses: { playerId: string; timestamp: number; valid: boolean }[]) {
  return responses.filter((response) => response.valid).sort((left, right) => right.timestamp - left.timestamp)[0] ?? null;
}

function getPenaltyReason(state: HeartAttackState, playerId: string, fallback: PenaltyReason): PenaltyReason {
  const player = state.players.find((item) => item.id === playerId);
  return player?.status === "pendingFinish" ? "pending-finish-failed" : fallback;
}

function createPenaltyResult(
  state: HeartAttackState,
  reason: PenaltyReason,
  playerId: string,
  pile: PlayedCard[],
  occurredAt: number,
  trigger: PlayedCard | null,
  responseAt: number | null = occurredAt
) {
  const player = state.players.find((item) => item.id === playerId);
  return {
    reason,
    playerId,
    playerName: player?.nickname ?? playerId,
    cardsTaken: pile.length,
    cardIds: pile.map((played) => played.card.id),
    responseTimeMs: trigger && responseAt !== null ? Math.max(0, responseAt - trigger.playedAt) : null,
    occurredAt
  };
}
