import type { Rank, Suit } from "../core/cards";
import { createSeededRandom } from "../core/random";
import { SEVENS_CLASSIC_PLAYERS, SEVENS_RACE_MAX_PLAYERS, SEVENS_RACE_MIN_PLAYERS, SEVENS_RANKS, SEVENS_SUITS } from "./constants";
import { createSevensDeck, dealSevensCards } from "./deck";
import { calculateStandings } from "./scoring";
import type { CreateSevensGameOptions, SevensAction, SevensCard, SevensPlayer, SevensState, SevensTableau, VisibleSevensState } from "./types";

export function createSevensGame(options: CreateSevensGameOptions): SevensState {
  validatePlayers(options);
  const random = options.random ?? createSeededRandom(options.seed ?? Date.now());
  const players: SevensPlayer[] = options.players.map((player, seat) => ({
    id: player.id, nickname: player.nickname, seat, type: player.type ?? "human",
    botDifficulty: player.botDifficulty, status: "playing"
  }));
  const hands = dealSevensCards(createSevensDeck(options.mode, random), players.map((player) => player.id));
  const startingPlayerId = getStartingPlayer(hands);
  return {
    phase: "playing", mode: options.mode, players, hands, tableau: createEmptyTableau(),
    coveredCards: Object.fromEntries(players.map((player) => [player.id, []])),
    currentPlayerId: startingPlayerId, startingPlayerId,
    direction: options.mode === "classic-four" ? "counterclockwise" : "clockwise",
    turnNumber: 1, winnerId: null, standings: null, lastAction: null
  };
}

export function getStartingPlayer(hands: Record<string, SevensCard[]>) {
  const entry = Object.entries(hands).find(([, cards]) => cards.some((card) => card.suit === "spades" && card.rank === "7"));
  if (!entry) throw new Error("The sevens deck must contain the seven of spades.");
  return entry[0];
}

export function getLegalPlays(state: SevensState, playerId = state.currentPlayerId) {
  if (!playerId || state.phase !== "playing" || state.currentPlayerId !== playerId) return [];
  return (state.hands[playerId] ?? []).filter((card) => canPlayCard(state, playerId, card.id));
}

export function canPlayCard(state: SevensState, playerId: string, cardId: string) {
  if (state.phase !== "playing" || state.currentPlayerId !== playerId) return false;
  const card = (state.hands[playerId] ?? []).find((item) => item.id === cardId);
  if (!card || isOccupiedDuplicate(state, card)) return false;
  if (state.turnNumber === 1) return card.suit === "spades" && card.rank === "7";
  if (card.rank === "7") return !state.tableau[card.suit]["7"];
  if (!state.tableau[card.suit]["7"]) return false;
  const rankIndex = SEVENS_RANKS.indexOf(card.rank);
  const neighborRank = rankIndex < 6 ? SEVENS_RANKS[rankIndex + 1] : SEVENS_RANKS[rankIndex - 1];
  return Boolean(state.tableau[card.suit][neighborRank]);
}

export function isOccupiedDuplicate(state: SevensState, card: Pick<SevensCard, "suit" | "rank">) {
  return Boolean(state.tableau[card.suit][card.rank]);
}

export function playCard(state: SevensState, action: Extract<SevensAction, { type: "PLAY_CARD" }>): SevensState {
  if (!canPlayCard(state, action.playerId, action.cardId)) throw new Error("Illegal sevens play.");
  const hand = state.hands[action.playerId];
  const card = hand.find((item) => item.id === action.cardId)!;
  const nextHands = { ...state.hands, [action.playerId]: hand.filter((item) => item.id !== card.id) };
  const nextTableau = cloneTableau(state.tableau);
  nextTableau[card.suit][card.rank] = { ...card, playerId: action.playerId, turnNumber: state.turnNumber };
  const playedOut = nextHands[action.playerId].length === 0;
  const nextPlayerId = playedOut ? null : getNextPlayer({ ...state, hands: nextHands }, action.playerId);
  let nextState: SevensState = {
    ...state, hands: nextHands, tableau: nextTableau, turnNumber: state.turnNumber + 1,
    currentPlayerId: nextPlayerId,
    lastAction: { type: "PLAY_CARD", playerId: action.playerId, card, nextPlayerId, turnNumber: state.turnNumber, firstCoverFallback: false }
  };
  if (playedOut) nextState = finishGame(nextState);
  return nextState;
}

export function canCoverCard(state: SevensState, playerId: string, cardId: string) {
  if (state.phase !== "playing" || state.currentPlayerId !== playerId) return false;
  const hand = state.hands[playerId] ?? [];
  const card = hand.find((item) => item.id === cardId);
  if (!card) return false;
  if (state.mode === "classic-four" || (state.coveredCards[playerId]?.length ?? 0) > 0) return true;
  const hasEdge = hand.some((item) => item.rank === "A" || item.rank === "K");
  return !hasEdge || card.rank === "A" || card.rank === "K";
}

export function coverCard(state: SevensState, action: Extract<SevensAction, { type: "COVER_CARD" }>): SevensState {
  if (!canCoverCard(state, action.playerId, action.cardId)) throw new Error("Illegal sevens cover.");
  const hand = state.hands[action.playerId];
  const card = hand.find((item) => item.id === action.cardId)!;
  const firstCover = (state.coveredCards[action.playerId]?.length ?? 0) === 0;
  const hasEdge = hand.some((item) => item.rank === "A" || item.rank === "K");
  const firstCoverFallback = state.mode === "double-deck-race" && firstCover && !hasEdge;
  const nextHands = { ...state.hands, [action.playerId]: hand.filter((item) => item.id !== card.id) };
  const nextPlayerId = getNextPlayer({ ...state, hands: nextHands }, action.playerId);
  return {
    ...state, hands: nextHands,
    coveredCards: { ...state.coveredCards, [action.playerId]: [...(state.coveredCards[action.playerId] ?? []), card] },
    currentPlayerId: nextPlayerId, turnNumber: state.turnNumber + 1,
    lastAction: { type: "COVER_CARD", playerId: action.playerId, card, nextPlayerId, turnNumber: state.turnNumber, firstCoverFallback }
  };
}

export function getNextPlayer(state: SevensState, fromPlayerId: string) {
  const players = [...state.players].sort((left, right) => left.seat - right.seat);
  const start = players.findIndex((player) => player.id === fromPlayerId);
  const step = state.direction === "clockwise" ? 1 : -1;
  for (let offset = 1; offset <= players.length; offset += 1) {
    const player = players[(start + offset * step + players.length) % players.length];
    if ((state.hands[player.id]?.length ?? 0) > 0) return player.id;
  }
  return null;
}

export function getVisibleSevensState(state: SevensState, viewerId: string): VisibleSevensState {
  const { hands, coveredCards, ...publicState } = state;
  return {
    ...publicState,
    handCounts: Object.fromEntries(state.players.map((player) => [player.id, hands[player.id]?.length ?? 0])),
    coveredCounts: Object.fromEntries(state.players.map((player) => [player.id, coveredCards[player.id]?.length ?? 0])),
    ownHand: [...(hands[viewerId] ?? [])], ownCoveredCards: [...(coveredCards[viewerId] ?? [])]
  };
}

export function applySevensAction(state: SevensState, action: SevensAction) {
  return action.type === "PLAY_CARD" ? playCard(state, action) : coverCard(state, action);
}

export function getSlotId(suit: Suit, rank: Rank) { return `${suit}-${rank}`; }

function validatePlayers(options: CreateSevensGameOptions) {
  const count = options.players.length;
  if (options.mode === "classic-four" && count !== SEVENS_CLASSIC_PLAYERS) throw new Error("Classic sevens requires exactly four players.");
  if (options.mode === "double-deck-race" && (count < SEVENS_RACE_MIN_PLAYERS || count > SEVENS_RACE_MAX_PLAYERS)) throw new Error("Double-deck sevens requires 5 to 8 players.");
  if (new Set(options.players.map((player) => player.id)).size !== count) throw new Error("Player ids must be unique.");
}

function createEmptyTableau(): SevensTableau {
  return Object.fromEntries(SEVENS_SUITS.map((suit) => [suit, {}])) as SevensTableau;
}

function cloneTableau(tableau: SevensTableau): SevensTableau {
  return Object.fromEntries(SEVENS_SUITS.map((suit) => [suit, { ...tableau[suit] }])) as SevensTableau;
}

function finishGame(state: SevensState): SevensState {
  const standings = calculateStandings(state);
  const winnerId = standings[0]?.playerId ?? null;
  return {
    ...state, phase: "finished", currentPlayerId: null, standings, winnerId,
    players: state.players.map((player) => ({ ...player, status: player.id === winnerId ? "winner" : "finished" }))
  };
}
