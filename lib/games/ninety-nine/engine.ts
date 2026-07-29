import type { Card } from "../core/cards";
import { isSameCard } from "../core/cards";
import { createSeededRandom, shuffle, type RandomSource } from "../core/random";
import {
  NINETY_NINE_HAND_SIZE,
  NINETY_NINE_MAX_PLAYERS,
  NINETY_NINE_MIN_PLAYERS
} from "./constants";
import { createNinetyNineDeck } from "./deck";
import { calculateResultingTotal, describeChoice, getLegalActions, isLegalAction } from "./actions";
import type {
  CreateNinetyNinePlayerInput,
  NinetyNineAction,
  NinetyNinePlayer,
  NinetyNineResolvedAction,
  NinetyNineState,
  VisibleNinetyNineState
} from "./types";

export type CreateNinetyNineGameOptions = {
  players: CreateNinetyNinePlayerInput[];
  random?: RandomSource;
  seed?: number;
};

export function createNinetyNineGame(options: CreateNinetyNineGameOptions): NinetyNineState {
  if (options.players.length < NINETY_NINE_MIN_PLAYERS || options.players.length > NINETY_NINE_MAX_PLAYERS) {
    throw new Error("Ninety-nine requires 2 to 6 players.");
  }

  const ids = new Set(options.players.map((player) => player.id));
  if (ids.size !== options.players.length) throw new Error("Player ids must be unique.");

  const random = options.random ?? createSeededRandom(options.seed ?? Date.now());
  const drawPile = createNinetyNineDeck(random);
  const hands: Record<string, Card[]> = {};

  for (const player of options.players) {
    hands[player.id] = drawPile.splice(0, NINETY_NINE_HAND_SIZE);
  }

  const players: NinetyNinePlayer[] = options.players.map((player, seat) => ({
    id: player.id,
    nickname: player.nickname,
    seat,
    type: player.type ?? "human",
    botDifficulty: player.botDifficulty,
    status: "playing",
    connected: player.connected ?? true
  }));

  return {
    phase: "playing",
    players,
    hands,
    drawPile,
    discardPile: [],
    currentTotal: 0,
    currentPlayerId: players[0]?.id ?? null,
    direction: 1,
    lastAction: null,
    eliminatedPlayerId: null,
    winnerId: null,
    turnNumber: 1
  };
}

export function applyNinetyNineAction(state: NinetyNineState, action: NinetyNineAction, random: RandomSource = Math.random, system = false): NinetyNineState {
  if (state.phase === "finished") throw new Error("Cannot play after game finished.");
  if (action.playerId !== state.currentPlayerId) throw new Error("It is not this player's turn.");
  if (!isLegalAction(state, action)) throw new Error("Illegal ninety-nine action.");

  const hand = state.hands[action.playerId] ?? [];
  const card = hand.find((item) => item.id === action.cardId);
  if (!card) throw new Error("Card is not in the player's hand.");

  const previousTotal = state.currentTotal;
  const newTotal = calculateResultingTotal(previousTotal, card, action.choice);
  const nextDirection = card.rank === "4" ? reverseDirection(state.direction) : state.direction;
  const nextHands = { ...state.hands, [action.playerId]: hand.filter((item) => !isSameCard(item, card)) };
  let nextState: NinetyNineState = {
    ...state,
    phase: "playing",
    hands: nextHands,
    discardPile: [...state.discardPile, card],
    currentTotal: newTotal,
    direction: nextDirection,
    eliminatedPlayerId: null,
    turnNumber: state.turnNumber + 1
  };

  const drawResult = drawCardForPlayer(nextState, action.playerId, random);
  nextState = drawResult.state;

  const nextPlayerId = calculateNextPlayer(nextState, action.playerId, card, action);
  const actionRecord: NinetyNineResolvedAction = {
    playerId: action.playerId,
    card,
    choice: action.choice,
    previousTotal,
    newTotal,
    direction: nextState.direction,
    nextPlayerId,
    effectLabel: describeChoice(card, action.choice),
    drewCard: drawResult.drewCard,
    eliminatedPlayerIds: [],
    system
  };

  nextState = { ...nextState, lastAction: actionRecord, currentPlayerId: nextPlayerId };
  return resolveTurnStart(nextState);
}

export function calculateNextPlayer(state: NinetyNineState, fromPlayerId = state.currentPlayerId, card?: Card, action?: NinetyNineAction): string | null {
  if (!fromPlayerId) return null;
  if (card?.rank === "5" && action?.choice.kind === "target-player") return action.choice.targetPlayerId;
  if (card?.rank === "J") return getNextPlayingPlayerId(state, getNextPlayingPlayerId(state, fromPlayerId, state.direction), state.direction);
  return getNextPlayingPlayerId(state, fromPlayerId, state.direction);
}

export function drawCardForPlayer(state: NinetyNineState, playerId: string, random: RandomSource = Math.random) {
  let drawPile = [...state.drawPile];
  let discardPile = [...state.discardPile];
  const hand = [...(state.hands[playerId] ?? [])];
  let drewCard = false;

  while (hand.length < NINETY_NINE_HAND_SIZE) {
    if (drawPile.length === 0) {
      const recycled = recycleDiscardPile({ ...state, drawPile, discardPile }, random);
      drawPile = recycled.drawPile;
      discardPile = recycled.discardPile;
    }

    const [card, ...remaining] = drawPile;
    if (!card) break;
    hand.push(card);
    drawPile = remaining;
    drewCard = true;
  }

  return {
    drewCard,
    state: {
      ...state,
      drawPile,
      discardPile,
      hands: { ...state.hands, [playerId]: hand }
    }
  };
}

export function recycleDiscardPile(state: NinetyNineState, random: RandomSource = Math.random) {
  if (state.drawPile.length > 0 || state.discardPile.length <= 1) return state;
  const lastOpenCard = state.discardPile.at(-1);
  const recyclable = state.discardPile.slice(0, -1);
  return {
    ...state,
    drawPile: shuffle(recyclable, random),
    discardPile: lastOpenCard ? [lastOpenCard] : []
  };
}

export function eliminatePlayerIfStuck(state: NinetyNineState, playerId = state.currentPlayerId): NinetyNineState {
  if (!playerId) return state;
  const player = state.players.find((item) => item.id === playerId);
  if (!player || player.status !== "playing") return state;
  if (getLegalActions(state, playerId).length > 0) return state;

  const discardedHand = state.hands[playerId] ?? [];
  const nextPlayers = state.players.map((item) => item.id === playerId ? { ...item, status: "eliminated" as const } : item);
  const nextHands = { ...state.hands, [playerId]: [] };
  const nextState: NinetyNineState = {
    ...state,
    phase: "player-eliminated",
    players: nextPlayers,
    hands: nextHands,
    discardPile: [...state.discardPile, ...discardedHand],
    eliminatedPlayerId: playerId
  };

  const winnerId = getNinetyNineWinner(nextState);
  if (winnerId) {
    return {
      ...nextState,
      phase: "finished",
      winnerId,
      currentPlayerId: null,
      players: nextState.players.map((item) => item.id === winnerId ? { ...item, status: "winner" } : item)
    };
  }

  return {
    ...nextState,
    phase: "playing",
    currentPlayerId: getNextPlayingPlayerId(nextState, playerId, nextState.direction)
  };
}

export function getNinetyNineWinner(state: NinetyNineState) {
  if (state.winnerId) return state.winnerId;
  const active = state.players.filter((player) => player.status === "playing");
  return active.length === 1 ? active[0].id : null;
}

export function getVisibleNinetyNineState(state: NinetyNineState): VisibleNinetyNineState {
  const handCounts = Object.fromEntries(state.players.map((player) => [player.id, state.hands[player.id]?.length ?? 0]));
  const { hands: _hands, drawPile: _drawPile, ...publicState } = state;
  return {
    ...publicState,
    handCounts,
    drawPileCount: state.drawPile.length
  };
}

export function resolveTurnStart(state: NinetyNineState): NinetyNineState {
  let nextState = state;
  const eliminatedPlayerIds: string[] = [];

  while (nextState.phase !== "finished" && nextState.currentPlayerId) {
    const before = nextState;
    nextState = eliminatePlayerIfStuck(nextState, nextState.currentPlayerId);
    if (nextState.eliminatedPlayerId && nextState.eliminatedPlayerId !== before.eliminatedPlayerId) {
      eliminatedPlayerIds.push(nextState.eliminatedPlayerId);
    }
    if (nextState.currentPlayerId === before.currentPlayerId || nextState.phase === "finished") break;
  }

  if (eliminatedPlayerIds.length > 0 && nextState.lastAction) {
    nextState = {
      ...nextState,
      lastAction: {
        ...nextState.lastAction,
        eliminatedPlayerIds,
        nextPlayerId: nextState.currentPlayerId
      }
    };
  }

  return nextState;
}

export function isNinetyNineGameFinished(state: NinetyNineState) {
  return state.phase === "finished";
}

function getNextPlayingPlayerId(state: NinetyNineState, fromPlayerId: string | null, direction: 1 | -1): string | null {
  if (!fromPlayerId) return null;
  const ordered = [...state.players].sort((left, right) => left.seat - right.seat);
  const startIndex = ordered.findIndex((player) => player.id === fromPlayerId);
  if (startIndex === -1) return null;

  for (let offset = 1; offset <= ordered.length; offset += 1) {
    const index = (startIndex + offset * direction + ordered.length) % ordered.length;
    const player = ordered[index];
    if (player.status === "playing") return player.id;
  }

  return null;
}

function reverseDirection(direction: 1 | -1): 1 | -1 {
  return direction === 1 ? -1 : 1;
}
