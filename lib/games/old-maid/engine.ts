import { createStandardDeck, type Card, type Rank } from "../core/cards";
import { createSeededRandom, shuffle, type RandomSource } from "../core/random";

export type OldMaidCard = Card | { id: string; suit: null; rank: "JOKER" };
export type OldMaidPlayerStatus = "playing" | "safe" | "loser";

export interface OldMaidPlayer {
  id: string;
  nickname: string;
  seat: number;
  status: OldMaidPlayerStatus;
}

export interface OldMaidRemovedPair {
  playerId: string;
  rank: Rank;
  cards: [OldMaidCard, OldMaidCard];
}

export interface OldMaidDrawLayout {
  turnNumber: number;
  targetPlayerId: string;
  slots: Array<{ cardSlotId: string; cardId: string }>;
}

export interface OldMaidDrawAction {
  type: "DRAW_CARD";
  playerId: string;
  targetPlayerId: string;
  turnNumber: number;
  cardSlotId: string;
  system?: boolean;
}

export interface OldMaidState {
  phase: "playing" | "finished";
  players: OldMaidPlayer[];
  hands: Record<string, OldMaidCard[]>;
  dealerPlayerId: string;
  currentPlayerId: string | null;
  targetPlayerId: string | null;
  turnNumber: number;
  drawLayout: OldMaidDrawLayout | null;
  removedPairs: OldMaidRemovedPair[];
  finishOrder: string[];
  loserId: string | null;
  lastAction: {
    playerId: string;
    targetPlayerId: string;
    cardSlotId: string;
    card: OldMaidCard;
    removedPairs: OldMaidRemovedPair[];
    system: boolean;
  } | null;
}

export interface CreateOldMaidGameOptions {
  players: Array<{ id: string; nickname: string }>;
  seed?: number;
  random?: RandomSource;
}

export interface OldMaidOpeningSetup {
  dealtHands: Record<string, OldMaidCard[]>;
  pairsByPlayer: Record<string, OldMaidRemovedPair[]>;
  state: OldMaidState;
}

export function createOldMaidDeck(random: RandomSource = Math.random): OldMaidCard[] {
  return shuffle([
    ...createStandardDeck(),
    { id: "joker-1", suit: null, rank: "JOKER" } as const,
    { id: "joker-2", suit: null, rank: "JOKER" } as const
  ], random);
}

export function dealOldMaidCards(
  deck: readonly OldMaidCard[],
  players: readonly { id: string }[],
  dealerPlayerId: string
): Record<string, OldMaidCard[]> {
  if (players.length === 0) throw new Error("At least one player is required.");
  const dealerIndex = players.findIndex((player) => player.id === dealerPlayerId);
  if (dealerIndex < 0) throw new Error("Dealer is not a player.");

  const hands = Object.fromEntries(players.map((player) => [player.id, [] as OldMaidCard[]]));
  deck.forEach((card, index) => {
    const player = players[(dealerIndex + 1 + index) % players.length];
    hands[player.id].push(card);
  });
  return hands;
}

export function removeOldMaidPairs(
  hand: readonly OldMaidCard[],
  playerId: string
): { hand: OldMaidCard[]; pairs: OldMaidRemovedPair[] } {
  const cardsByRank = new Map<Rank, OldMaidCard[]>();

  hand.forEach((card) => {
    if (card.rank === "JOKER") return;
    const cards = cardsByRank.get(card.rank) ?? [];
    cards.push(card);
    cardsByRank.set(card.rank, cards);
  });

  const removedIds = new Set<string>();
  const pairs: OldMaidRemovedPair[] = [];

  cardsByRank.forEach((cards, rank) => {
    for (let index = 0; index + 1 < cards.length; index += 2) {
      const pair: [OldMaidCard, OldMaidCard] = [cards[index], cards[index + 1]];
      pair.forEach((card) => removedIds.add(card.id));
      pairs.push({ playerId, rank, cards: pair });
    }
  });

  return {
    hand: hand.filter((card) => !removedIds.has(card.id)),
    pairs
  };
}

export function createOldMaidGame(options: CreateOldMaidGameOptions): OldMaidState {
  return createOldMaidOpeningSetup(options).state;
}

export function createOldMaidOpeningSetup(
  options: CreateOldMaidGameOptions
): OldMaidOpeningSetup {
  if (options.players.length < 3 || options.players.length > 6) {
    throw new Error("Old Maid needs 3 to 6 players.");
  }
  if (new Set(options.players.map((player) => player.id)).size !== options.players.length) {
    throw new Error("Player ids must be unique.");
  }

  const random = options.random ?? createSeededRandom(options.seed ?? Date.now());
  const dealer = options.players[Math.floor(random() * options.players.length)];
  const dealtHands = dealOldMaidCards(createOldMaidDeck(random), options.players, dealer.id);
  const hands: Record<string, OldMaidCard[]> = {};
  const pairsByPlayer: Record<string, OldMaidRemovedPair[]> = {};
  const removedPairs: OldMaidRemovedPair[] = [];

  options.players.forEach((player) => {
    const result = removeOldMaidPairs(dealtHands[player.id], player.id);
    hands[player.id] = result.hand;
    pairsByPlayer[player.id] = result.pairs;
    removedPairs.push(...result.pairs);
  });

  const players: OldMaidPlayer[] = options.players.map((player, seat) => ({
    ...player,
    seat,
    status: hands[player.id].length === 0 ? "safe" : "playing"
  }));
  const state: OldMaidState = {
    phase: "playing",
    players,
    hands,
    dealerPlayerId: dealer.id,
    currentPlayerId: null,
    targetPlayerId: null,
    turnNumber: 1,
    drawLayout: null,
    removedPairs,
    finishOrder: players.filter((player) => player.status === "safe").map((player) => player.id),
    loserId: null,
    lastAction: null
  };

  return {
    dealtHands: Object.fromEntries(
      Object.entries(dealtHands).map(([playerId, hand]) => [playerId, [...hand]])
    ),
    pairsByPlayer,
    state: finishOrPrepareTurn(state, dealer.id, 1, random)
  };
}

export function applyOldMaidAction(
  state: OldMaidState,
  action: OldMaidDrawAction,
  random: RandomSource = Math.random
): OldMaidState {
  if (state.phase !== "playing") throw new Error("Game is not playing.");
  if (action.turnNumber !== state.turnNumber) throw new Error("Stale turn.");
  if (action.playerId !== state.currentPlayerId) throw new Error("It is not this player's turn.");
  if (action.targetPlayerId !== state.targetPlayerId) throw new Error("Invalid draw target.");

  const player = state.players.find((item) => item.id === action.playerId);
  const target = state.players.find((item) => item.id === action.targetPlayerId);
  if (player?.status !== "playing" || (state.hands[player.id]?.length ?? 0) === 0) {
    throw new Error("Player cannot draw.");
  }
  if (target?.status !== "playing" || (state.hands[target.id]?.length ?? 0) === 0) {
    throw new Error("Target cannot be drawn from.");
  }

  const slot = state.drawLayout?.turnNumber === state.turnNumber
    && state.drawLayout.targetPlayerId === target.id
    ? state.drawLayout.slots.find((item) => item.cardSlotId === action.cardSlotId)
    : undefined;
  if (!slot) throw new Error("Invalid card slot.");

  const targetHand = state.hands[target.id];
  const drawnCard = targetHand.find((card) => card.id === slot.cardId);
  if (!drawnCard) throw new Error("Card slot is no longer valid.");

  const nextTargetHand = targetHand.filter((card) => card.id !== drawnCard.id);
  const pairResult = removeOldMaidPairs([...(state.hands[player.id] ?? []), drawnCard], player.id);
  const hands = {
    ...state.hands,
    [target.id]: nextTargetHand,
    [player.id]: pairResult.hand
  };
  const newlySafe = [target.id, player.id].filter((id) => hands[id].length === 0);
  const players = state.players.map((item) =>
    newlySafe.includes(item.id) ? { ...item, status: "safe" as const } : item
  );
  const nextState: OldMaidState = {
    ...state,
    players,
    hands,
    currentPlayerId: null,
    targetPlayerId: null,
    turnNumber: state.turnNumber + 1,
    drawLayout: null,
    removedPairs: [...state.removedPairs, ...pairResult.pairs],
    finishOrder: [
      ...state.finishOrder,
      ...newlySafe.filter((id) => !state.finishOrder.includes(id))
    ],
    lastAction: {
      playerId: player.id,
      targetPlayerId: target.id,
      cardSlotId: action.cardSlotId,
      card: drawnCard,
      removedPairs: pairResult.pairs,
      system: Boolean(action.system)
    }
  };

  return finishOrPrepareTurn(nextState, player.id, nextState.turnNumber, random);
}

function finishOrPrepareTurn(
  state: OldMaidState,
  fromPlayerId: string,
  turnNumber: number,
  random: RandomSource
): OldMaidState {
  const activePlayers = state.players.filter((player) => state.hands[player.id].length > 0);
  if (activePlayers.length === 0) throw new Error("Old Maid must have one loser.");

  if (activePlayers.length === 1) {
    const loser = activePlayers[0];
    const loserHand = state.hands[loser.id];
    if (loserHand.length !== 2 || !loserHand.every((card) => card.rank === "JOKER")) {
      throw new Error("Finished game must leave exactly two jokers.");
    }
    return {
      ...state,
      phase: "finished",
      players: state.players.map((player) =>
        player.id === loser.id ? { ...player, status: "loser" } : { ...player, status: "safe" }
      ),
      currentPlayerId: null,
      targetPlayerId: null,
      drawLayout: null,
      loserId: loser.id
    };
  }

  const currentPlayerId = getNextActivePlayerId(state.players, state.hands, fromPlayerId);
  if (!currentPlayerId) throw new Error("Current player is missing.");
  const targetPlayerId = getNextActivePlayerId(state.players, state.hands, currentPlayerId);
  if (!targetPlayerId || targetPlayerId === currentPlayerId) throw new Error("Draw target is missing.");

  const presentedHand = shuffle(state.hands[targetPlayerId], random);
  const hands = { ...state.hands, [targetPlayerId]: presentedHand };
  const usedSlotIds = new Set<string>();
  const slots = presentedHand.map((card) => ({
    cardSlotId: createCardSlotId(turnNumber, random, usedSlotIds),
    cardId: card.id
  }));

  return {
    ...state,
    hands,
    currentPlayerId,
    targetPlayerId,
    turnNumber,
    drawLayout: { turnNumber, targetPlayerId, slots }
  };
}

function getNextActivePlayerId(
  players: readonly OldMaidPlayer[],
  hands: Readonly<Record<string, readonly OldMaidCard[]>>,
  fromPlayerId: string
) {
  const startIndex = players.findIndex((player) => player.id === fromPlayerId);
  if (startIndex < 0) throw new Error("Player is not in the game.");

  for (let offset = 1; offset <= players.length; offset += 1) {
    const player = players[(startIndex + offset) % players.length];
    if ((hands[player.id]?.length ?? 0) > 0) return player.id;
  }
  return null;
}

function createCardSlotId(turnNumber: number, random: RandomSource, used: Set<string>) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const left = Math.floor(random() * 0x100000000).toString(36);
    const right = Math.floor(random() * 0x100000000).toString(36);
    const cardSlotId = `slot-${turnNumber.toString(36)}-${left}${right}`;
    if (!used.has(cardSlotId)) {
      used.add(cardSlotId);
      return cardSlotId;
    }
  }
  throw new Error("Could not create unique card slots.");
}
