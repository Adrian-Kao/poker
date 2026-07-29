import { createSeededRandom, type RandomSource } from "../core/random";
import { BLUFF_MIN_PLAYERS } from "./constants";
import { createBluffDeck } from "./deck";
import { getActivePlayers, getNextBluffPlayerId, isBatchLie } from "./actions";
import type {
  BluffAction,
  BluffCard,
  BluffRank,
  BluffState,
  CreateBluffPlayerInput,
  PlayedBluffCard
} from "./types";

export type CreateBluffGameOptions = {
  players: CreateBluffPlayerInput[];
  seed?: number;
  random?: RandomSource;
};

export function createBluffGame(options: CreateBluffGameOptions): BluffState {
  if (options.players.length < BLUFF_MIN_PLAYERS) throw new Error("Bluff needs at least 3 players.");
  const ids = new Set(options.players.map((player) => player.id));
  if (ids.size !== options.players.length) throw new Error("Player ids must be unique.");

  const random = options.random ?? createSeededRandom(options.seed ?? Date.now());
  const deck = createBluffDeck(random);
  const hands: Record<string, BluffCard[]> = Object.fromEntries(options.players.map((player) => [player.id, []]));

  deck.forEach((card, index) => {
    const player = options.players[index % options.players.length];
    hands[player.id].push(card);
  });

  return {
    phase: "playing",
    players: options.players.map((player, seat) => ({
      id: player.id,
      nickname: player.nickname,
      seat,
      type: player.type ?? "human",
      botDifficulty: player.botDifficulty,
      status: "playing",
      connected: player.connected ?? true
    })),
    hands,
    centerPile: [],
    discardPile: [],
    batches: [],
    roundClaimRank: null,
    roundClaimCount: 0,
    currentPlayerId: options.players[0].id,
    lastBatchId: null,
    reactions: [],
    reactionStartedAt: null,
    reactionDeadline: null,
    reviewerId: null,
    roundResult: null,
    winnerId: null,
    turnNumber: 1
  };
}

export function applyBluffAction(state: BluffState, action: BluffAction, timestamp = Date.now()): BluffState {
  switch (action.type) {
    case "PLAY_CARDS":
      return playBluffCards(state, action.playerId, action.cardIds, action.roundClaimRank, action.timestamp ?? timestamp);
    case "REACT_TO_CLAIM":
      return submitBluffReaction(state, action.playerId, action.choice, action.actionId, action.timestamp ?? timestamp);
    case "DISCARD_FOUR_OF_KIND":
      return discardFourOfKind(state, action.playerId, action.cardIds, action.representedRank);
  }
}

export function playBluffCards(
  state: BluffState,
  playerId: string,
  cardIds: string[],
  roundClaimRank: BluffRank | undefined,
  timestamp = Date.now()
): BluffState {
  if (state.phase !== "playing") throw new Error("Cannot play now.");
  if (state.currentPlayerId !== playerId) throw new Error("It is not this player's turn.");
  if (cardIds.length < 1 || cardIds.length > 4) throw new Error("You must play 1 to 4 cards.");
  if (new Set(cardIds).size !== cardIds.length) throw new Error("Duplicate cards.");

  const hand = state.hands[playerId] ?? [];
  const cards = cardIds.map((id) => {
    const card = hand.find((item) => item.id === id);
    if (!card) throw new Error("Card is not in hand.");
    return card;
  });
  const claimedRank = state.roundClaimRank ?? roundClaimRank ?? cards.find((card) => card.rank !== "JOKER")?.rank ?? "A";
  if (claimedRank === "JOKER") throw new Error("Joker cannot be the called rank.");

  const batchId = `batch-${state.turnNumber}-${playerId}-${timestamp}`;
  const playedCards: PlayedBluffCard[] = cards.map((card) => ({ card, playerId, batchId, claimedRank, playedAt: timestamp }));
  const nextHand = hand.filter((card) => !cardIds.includes(card.id));
  const players = state.players.map((player) =>
    player.id === playerId && nextHand.length === 0 ? { ...player, status: "pendingFinish" as const } : player
  );

  return {
    ...state,
    phase: "reaction-window",
    players,
    hands: { ...state.hands, [playerId]: nextHand },
    centerPile: [...state.centerPile, ...playedCards],
    batches: [
      ...state.batches,
      { id: batchId, playerId, cardIds, addedCount: cardIds.length, claimedRank, playedAt: timestamp, turnNumber: state.turnNumber }
    ],
    roundClaimRank: claimedRank,
    roundClaimCount: cardIds.length,
    currentPlayerId: null,
    lastBatchId: batchId,
    reactions: [],
    reactionStartedAt: timestamp,
    reactionDeadline: null,
    reviewerId: null,
    roundResult: null
  };
}

export function submitBluffReaction(
  state: BluffState,
  playerId: string,
  choice: "trust" | "challenge",
  actionId: string,
  timestamp = Date.now()
): BluffState {
  if (state.phase !== "reaction-window") throw new Error("Cannot react now.");
  const batch = state.batches.at(-1);
  if (!batch) throw new Error("No claim to react to.");
  if (batch.playerId === playerId) throw new Error("You cannot react to your own claim.");
  if (!getActivePlayers(state).some((player) => player.id === playerId)) throw new Error("Player cannot react.");
  if (state.reactions.some((reaction) => reaction.actionId === actionId || reaction.playerId === playerId)) return state;

  const reactions = [...state.reactions, { playerId, choice, actionId, receivedAt: timestamp }];
  if (choice === "challenge") return resolveBluffChallenge({ ...state, reactions, reviewerId: playerId }, playerId, timestamp);

  const reviewers = getActivePlayers(state).filter((player) => player.id !== batch.playerId);
  if (reviewers.every((player) => reactions.some((reaction) => reaction.playerId === player.id && reaction.choice === "trust"))) {
    return resolveAllTrust({ ...state, reactions }, timestamp);
  }

  return { ...state, reactions };
}

export function resolveAllTrust(state: BluffState, timestamp = Date.now()): BluffState {
  const batch = state.batches.at(-1);
  if (!batch) return state;
  return advanceAfterCleanRound({ ...state, phase: "playing", reactions: [], reactionDeadline: null, reactionStartedAt: null }, batch.playerId, timestamp);
}

export function resolveBluffChallenge(state: BluffState, challengerId: string, timestamp = Date.now()): BluffState {
  const batch = state.batches.at(-1);
  if (!batch) throw new Error("No claim to challenge.");
  const revealedCards = state.centerPile.filter((played) => played.batchId === batch.id).map((played) => played.card);
  const isLie = isBatchLie(revealedCards, batch.claimedRank);
  const penaltyPlayerId = isLie ? batch.playerId : challengerId;
  const nextStarterId = isLie ? challengerId : batch.playerId;
  const pileCards = state.centerPile.map((played) => played.card);

  return {
    ...state,
    phase: "round-result",
    players: restorePenaltyPlayer(state.players, penaltyPlayerId),
    hands: { ...state.hands, [penaltyPlayerId]: [...(state.hands[penaltyPlayerId] ?? []), ...pileCards] },
    centerPile: [],
    roundClaimRank: null,
    roundClaimCount: 0,
    currentPlayerId: nextStarterId,
    reactions: [],
    reactionStartedAt: null,
    reactionDeadline: null,
    reviewerId: challengerId,
    roundResult: {
      challengerId,
      challengedPlayerId: batch.playerId,
      penaltyPlayerId,
      isLie,
      revealedCards,
      collectedCardCount: pileCards.length,
      message: isLie ? "抓到了齁" : "說好的信任呢"
    },
    turnNumber: state.turnNumber + 1
  };
}

export function resolveRoundResult(state: BluffState, timestamp = Date.now()): BluffState {
  if (state.phase !== "round-result") return state;
  return startRoundAt({ ...state, phase: "playing", roundResult: null }, state.currentPlayerId, timestamp);
}

export function expireReactionWindow(state: BluffState, timestamp = Date.now()): BluffState {
  if (state.phase !== "reaction-window") return state;
  return resolveAllTrust(state, timestamp);
}

export function discardFourOfKind(state: BluffState, playerId: string, cardIds: [string, string, string, string], representedRank: BluffRank): BluffState {
  const hand = state.hands[playerId] ?? [];
  const cards = cardIds.map((id) => {
    const card = hand.find((item) => item.id === id);
    if (!card) throw new Error("Card is not in hand.");
    return card;
  });
  const wildcards = cards.filter((card) => card.rank === "JOKER").length;
  const matching = cards.filter((card) => card.rank === representedRank).length;
  if (matching + wildcards !== 4) throw new Error("Cards do not form four of a kind.");

  const nextHand = hand.filter((card) => !cardIds.includes(card.id));
  return {
    ...state,
    hands: { ...state.hands, [playerId]: nextHand },
    discardPile: [...state.discardPile, ...cards],
    players: state.players.map((player) =>
      player.id === playerId && nextHand.length === 0 ? { ...player, status: "pendingFinish" as const } : player
    )
  };
}

export function getLegalBluffActions(state: BluffState, playerId = state.currentPlayerId ?? "") {
  if (state.phase !== "playing" || state.currentPlayerId !== playerId) return [];
  const hand = state.hands[playerId] ?? [];
  const claim = state.roundClaimRank ?? hand.find((card) => card.rank !== "JOKER")?.rank ?? "A";
  return hand.map((card) => ({ type: "PLAY_CARDS" as const, playerId, cardIds: [card.id], roundClaimRank: claim }));
}

export function getBluffWinner(state: BluffState) {
  return state.winnerId;
}

function advanceAfterCleanRound(state: BluffState, fromPlayerId: string | null, timestamp: number): BluffState {
  if (!fromPlayerId) return finishIfNeeded(state);
  let nextState = state;
  let candidateId = getNextBluffPlayerId(nextState, fromPlayerId);

  while (candidateId) {
    const candidate = nextState.players.find((player) => player.id === candidateId);
    if (candidate?.status === "pendingFinish") {
      nextState = markWinner(nextState, candidateId);
      if (nextState.phase === "finished") return nextState;
      candidateId = getNextBluffPlayerId(nextState, candidateId);
      continue;
    }
    if (candidate?.status === "playing") {
      return { ...nextState, phase: "playing", currentPlayerId: candidateId, turnNumber: nextState.turnNumber + 1 };
    }
    candidateId = getNextBluffPlayerId(nextState, candidateId);
  }

  return finishIfNeeded(nextState);
}

function startRoundAt(state: BluffState, playerId: string | null, timestamp: number): BluffState {
  if (!playerId) return finishIfNeeded(state);
  const player = state.players.find((item) => item.id === playerId);

  if (player?.status === "pendingFinish") {
    const rankedState = markWinner(state, playerId);
    if (rankedState.phase === "finished") return rankedState;
    return advanceAfterCleanRound(rankedState, playerId, timestamp);
  }

  if (player?.status === "playing") {
    return { ...state, phase: "playing", currentPlayerId: playerId, turnNumber: state.turnNumber + 1 };
  }

  return advanceAfterCleanRound(state, playerId, timestamp);
}

function markWinner(state: BluffState, playerId: string): BluffState {
  const nextState = {
    ...state,
    winnerId: state.winnerId ?? playerId,
    players: state.players.map((player) => (player.id === playerId ? { ...player, status: "winner" as const } : player))
  };
  return finishIfNeeded(nextState);
}

function finishIfNeeded(state: BluffState): BluffState {
  const unfinished = state.players.filter((player) => player.status === "playing" || player.status === "pendingFinish");
  if (unfinished.length > 1) return state;
  return {
    ...state,
    phase: "finished",
    currentPlayerId: null,
    winnerId: state.winnerId ?? state.players.find((player) => player.status === "winner")?.id ?? unfinished[0]?.id ?? null,
    players: state.players.map((player) =>
      player.status === "winner" ? player : unfinished.some((item) => item.id === player.id) ? { ...player, status: "loser" } : player
    )
  };
}

function restorePenaltyPlayer(players: BluffState["players"], playerId: string) {
  return players.map((player) => (player.id === playerId && player.status === "pendingFinish" ? { ...player, status: "playing" as const } : player));
}
