import { createStandardDeck, isSameCard } from "../core/cards";
import type { Card } from "../core/cards";
import { createSeededRandom, shuffle, type RandomSource } from "../core/random";
import { calculateResultingTotal, getLegalActions, isActionStructurallyLegal } from "./actions";
import type { CreateNinetyNinePlayerInput, GameLogEntry, NinetyNineAction, NinetyNineState } from "./types";

export type CreateNinetyNineGameOptions = {
  players: CreateNinetyNinePlayerInput[];
  random?: RandomSource;
  seed?: number;
};

export function createNinetyNineGame(options: CreateNinetyNineGameOptions): NinetyNineState {
  if (options.players.length < 2) {
    throw new Error("Ninety-nine requires at least 2 players.");
  }

  const playerIds = new Set(options.players.map((player) => player.id));
  if (playerIds.size !== options.players.length) {
    throw new Error("Player ids must be unique.");
  }

  const random = options.random ?? createSeededRandom(options.seed ?? Date.now());
  const deck = shuffle(createStandardDeck(), random);
  const hands: Record<string, Card[]> = {};

  for (const player of options.players) {
    hands[player.id] = deck.splice(0, 5);
  }

  return {
    phase: "playing",
    players: options.players.map((player) => ({ ...player, eliminated: false })),
    hands,
    deck,
    discardPile: [],
    total: 0,
    currentPlayerId: options.players[0]?.id ?? null,
    direction: 1,
    winnerId: null,
    turnNumber: 1,
    actionLog: [
      {
        turnNumber: 0,
        type: "GAME_CREATED",
        message: "Ninety-nine game created."
      }
    ]
  };
}

export function applyNinetyNineAction(state: NinetyNineState, action: NinetyNineAction): NinetyNineState {
  if (state.phase !== "playing") {
    throw new Error("Cannot apply an action unless the game is playing.");
  }

  if (action.playerId !== state.currentPlayerId) {
    throw new Error("It is not this player's turn.");
  }

  if (!isActionStructurallyLegal(state, action)) {
    throw new Error("Illegal ninety-nine action.");
  }

  const hand = state.hands[action.playerId] ?? [];
  const card = hand.find((item) => item.id === action.cardId);
  if (!card) {
    throw new Error("Card is not in the player's hand.");
  }

  const nextTotal = calculateResultingTotal(state.total, card, action.effectChoice);
  const nextDirection = card.rank === "4" ? ((state.direction * -1) as 1 | -1) : state.direction;
  const nextHands = {
    ...state.hands,
    [action.playerId]: drawBackToFive(hand.filter((item) => !isSameCard(item, card)), state.deck)
  };
  const drawnCount = Math.max(0, 5 - (hand.length - 1));
  const nextDeck = state.deck.slice(drawnCount);
  const discardPile = [...state.discardPile, card];

  const nextState: NinetyNineState = {
    ...state,
    hands: nextHands,
    deck: nextDeck,
    discardPile,
    total: nextTotal,
    direction: nextDirection,
    turnNumber: state.turnNumber + 1,
    actionLog: [
      ...state.actionLog,
      {
        turnNumber: state.turnNumber,
        type: "CARD_PLAYED",
        playerId: action.playerId,
        message: `${action.playerId} played ${card.id}.`
      }
    ]
  };

  return advanceTurn(nextState, action.targetPlayerId);
}

export function isNinetyNineGameFinished(state: NinetyNineState) {
  return state.phase === "finished";
}

export function getNinetyNineWinner(state: NinetyNineState) {
  return state.winnerId;
}

function drawBackToFive(hand: Card[], deck: Card[]) {
  const drawCount = Math.max(0, 5 - hand.length);
  return [...hand, ...deck.slice(0, drawCount)];
}

function advanceTurn(state: NinetyNineState, targetPlayerId?: string): NinetyNineState {
  let nextState = { ...state };
  const logEntries: GameLogEntry[] = [];
  let nextPlayerId = targetPlayerId ?? getNextActivePlayerId(nextState);

  while (nextPlayerId) {
    const simulatedState = { ...nextState, currentPlayerId: nextPlayerId };
    if (getLegalActions(simulatedState, nextPlayerId).length > 0) {
      return {
        ...nextState,
        currentPlayerId: nextPlayerId,
        actionLog: [...nextState.actionLog, ...logEntries]
      };
    }

    nextState = eliminatePlayer(nextState, nextPlayerId);
    logEntries.push({
      turnNumber: nextState.turnNumber,
      type: "PLAYER_ELIMINATED",
      playerId: nextPlayerId,
      message: `${nextPlayerId} cannot play and is eliminated.`
    });

    const winnerId = getOnlyActivePlayerId(nextState);
    if (winnerId) {
      return {
        ...nextState,
        phase: "finished",
        currentPlayerId: null,
        winnerId,
        actionLog: [
          ...nextState.actionLog,
          ...logEntries,
          {
            turnNumber: nextState.turnNumber,
            type: "GAME_FINISHED",
            playerId: winnerId,
            message: `${winnerId} wins ninety-nine.`
          }
        ]
      };
    }

    nextPlayerId = getNextActivePlayerId({ ...nextState, currentPlayerId: nextPlayerId });
  }

  return {
    ...nextState,
    phase: "finished",
    currentPlayerId: null,
    winnerId: getOnlyActivePlayerId(nextState),
    actionLog: [...nextState.actionLog, ...logEntries]
  };
}

function eliminatePlayer(state: NinetyNineState, playerId: string): NinetyNineState {
  return {
    ...state,
    players: state.players.map((player) => (player.id === playerId ? { ...player, eliminated: true } : player))
  };
}

function getNextActivePlayerId(state: NinetyNineState) {
  if (!state.currentPlayerId) return null;

  const startIndex = state.players.findIndex((player) => player.id === state.currentPlayerId);
  if (startIndex === -1) return null;

  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const index = (startIndex + offset * state.direction + state.players.length) % state.players.length;
    const player = state.players[index];
    if (!player.eliminated) return player.id;
  }

  return null;
}

function getOnlyActivePlayerId(state: NinetyNineState) {
  const activePlayers = state.players.filter((player) => !player.eliminated);
  return activePlayers.length === 1 ? activePlayers[0].id : null;
}
