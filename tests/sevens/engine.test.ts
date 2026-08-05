import assert from "node:assert/strict";
import test from "node:test";
import type { Rank, Suit } from "../../lib/games/core/cards";
import {
  calculateBotMove,
  calculateClassicScore,
  canCoverCard,
  canPlayCard,
  coverCard,
  createSevensDeck,
  createSevensDoubleDeck,
  createSevensGame,
  dealSevensCards,
  getLegalPlays,
  getNextPlayer,
  getVisibleSevensState,
  playCard,
  type SevensCard,
  type SevensMode,
  type SevensState
} from "../../lib/games/sevens";

const playerIds = ["p1", "p2", "p3", "p4"];

function card(suit: Suit, rank: Rank, deckIndex = 0): SevensCard {
  return { id: `${deckIndex}-${suit}-${rank}`, suit, rank, deckIndex };
}

function state(options: {
  mode?: SevensMode;
  current?: string;
  hands?: Record<string, SevensCard[]>;
  turn?: number;
  direction?: "clockwise" | "counterclockwise";
} = {}): SevensState {
  const mode = options.mode ?? "classic-four";
  const ids = mode === "classic-four" ? playerIds : [...playerIds, "p5"];
  return {
    phase: "playing",
    mode,
    players: ids.map((id, seat) => ({ id, nickname: id, seat, type: seat === 0 ? "human" : "bot", status: "playing" })),
    hands: options.hands ?? Object.fromEntries(ids.map((id) => [id, [card("clubs", "A")]])),
    tableau: { spades: {}, hearts: {}, diamonds: {}, clubs: {} },
    coveredCards: Object.fromEntries(ids.map((id) => [id, []])),
    currentPlayerId: options.current ?? "p1",
    startingPlayerId: "p1",
    direction: options.direction ?? (mode === "classic-four" ? "counterclockwise" : "clockwise"),
    turnNumber: options.turn ?? 1,
    winnerId: null,
    standings: null,
    lastAction: null
  };
}

test("經典牌組有 52 張且每位玩家收到 13 張", () => {
  const deck = createSevensDeck("classic-four", () => 0.5);
  assert.equal(deck.length, 52);
  const hands = dealSevensCards(deck, playerIds);
  assert.deepEqual(Object.values(hands).map((hand) => hand.length), [13, 13, 13, 13]);
});

test("雙副牌原始牌組 104 張且識別碼唯一", () => {
  const deck = createSevensDoubleDeck();
  assert.equal(deck.length, 104);
  assert.equal(new Set(deck.map((item) => item.id)).size, 104);
});

test("競速牌組移除一張黑桃 7", () => {
  const deck = createSevensDeck("double-deck-race", () => 0.5);
  assert.equal(deck.length, 103);
  assert.equal(deck.filter((item) => item.suit === "spades" && item.rank === "7").length, 1);
});

test("經典模式固定四人，競速模式接受五至八人", () => {
  assert.throws(() => createSevensGame({ mode: "classic-four", players: playerIds.slice(0, 3).map((id) => ({ id, nickname: id })) }));
  assert.doesNotThrow(() => createSevensGame({ mode: "classic-four", players: playerIds.map((id) => ({ id, nickname: id })), seed: 7 }));
  assert.doesNotThrow(() => createSevensGame({ mode: "double-deck-race", players: [...playerIds, "p5"].map((id) => ({ id, nickname: id })), seed: 7 }));
});

test("第一手只能打黑桃 7", () => {
  const game = state({ hands: { p1: [card("spades", "7"), card("hearts", "7")], p2: [card("clubs", "A")], p3: [card("clubs", "A")], p4: [card("clubs", "A")] } });
  assert.equal(canPlayCard(game, "p1", "0-spades-7"), true);
  assert.equal(canPlayCard(game, "p1", "0-hearts-7"), false);
  assert.deepEqual(getLegalPlays(game).map((item) => item.id), ["0-spades-7"]);
});

test("花色 7 尚未出現時不可接 6 或 8", () => {
  const game = state({ turn: 2, hands: { p1: [card("hearts", "6"), card("hearts", "8")], p2: [card("clubs", "A")], p3: [card("clubs", "A")], p4: [card("clubs", "A")] } });
  assert.equal(canPlayCard(game, "p1", "0-hearts-6"), false);
  assert.equal(canPlayCard(game, "p1", "0-hearts-8"), false);
});

test("只能接在同花色既有牌的相鄰位置", () => {
  const game = state({ turn: 2, hands: { p1: [card("hearts", "6"), card("hearts", "5"), card("hearts", "8")], p2: [card("clubs", "A")], p3: [card("clubs", "A")], p4: [card("clubs", "A")] } });
  game.tableau.hearts["7"] = { ...card("hearts", "7"), playerId: "p2", turnNumber: 1 };
  assert.equal(canPlayCard(game, "p1", "0-hearts-6"), true);
  assert.equal(canPlayCard(game, "p1", "0-hearts-8"), true);
  assert.equal(canPlayCard(game, "p1", "0-hearts-5"), false);
});

test("有合法牌時也可以自由選擇蓋牌", () => {
  const game = state({ turn: 2, hands: { p1: [card("hearts", "7"), card("clubs", "A")], p2: [card("clubs", "A")], p3: [card("clubs", "A")], p4: [card("clubs", "A")] } });
  assert.equal(canCoverCard(game, "p1", "0-clubs-A"), true);
});

test("無合法牌時可蓋牌，且原狀態保持不變", () => {
  const game = state({ turn: 2, hands: { p1: [card("clubs", "A")], p2: [card("clubs", "2")], p3: [card("clubs", "3")], p4: [card("clubs", "4")] } });
  const next = coverCard(game, { type: "COVER_CARD", playerId: "p1", cardId: "0-clubs-A", timestamp: 1 });
  assert.equal(game.hands.p1.length, 1);
  assert.equal(next.hands.p1.length, 0);
  assert.equal(next.coveredCards.p1.length, 1);
});

test("經典模式逆時針，競速模式順時針", () => {
  assert.equal(getNextPlayer(state(), "p1"), "p4");
  assert.equal(getNextPlayer(state({ mode: "double-deck-race" }), "p1"), "p2");
});

test("合法打出最後一張牌立即結束", () => {
  const game = state({ hands: { p1: [card("spades", "7")], p2: [card("clubs", "A")], p3: [card("clubs", "A")], p4: [card("clubs", "A")] } });
  const next = playCard(game, { type: "PLAY_CARD", playerId: "p1", cardId: "0-spades-7", timestamp: 1 });
  assert.equal(next.phase, "finished");
  assert.equal(next.winnerId, "p1");
});

test("經典蓋牌點數 A 至 K 為 1 至 13", () => {
  assert.equal(calculateClassicScore([card("clubs", "A"), card("clubs", "10"), card("clubs", "K")]), 24);
});

test("競速模式已被占用的重複牌不可再打出", () => {
  const game = state({ mode: "double-deck-race", turn: 2, hands: { p1: [card("hearts", "7", 1)], p2: [card("clubs", "A")], p3: [card("clubs", "A")], p4: [card("clubs", "A")], p5: [card("clubs", "A")] } });
  game.tableau.hearts["7"] = { ...card("hearts", "7", 0), playerId: "p2", turnNumber: 1 };
  assert.equal(canPlayCard(game, "p1", "1-hearts-7"), false);
});

test("競速模式第一次蓋牌有 A 或 K 時只能蓋邊牌", () => {
  const game = state({ mode: "double-deck-race", turn: 2, hands: { p1: [card("clubs", "A"), card("clubs", "5")], p2: [card("clubs", "2")], p3: [card("clubs", "3")], p4: [card("clubs", "4")], p5: [card("clubs", "6")] } });
  assert.equal(canCoverCard(game, "p1", "0-clubs-A"), true);
  assert.equal(canCoverCard(game, "p1", "0-clubs-5"), false);
});

test("競速模式沒有 A 或 K 時允許第一次蓋牌 fallback", () => {
  const game = state({ mode: "double-deck-race", turn: 2, hands: { p1: [card("clubs", "5")], p2: [card("clubs", "2")], p3: [card("clubs", "3")], p4: [card("clubs", "4")], p5: [card("clubs", "6")] } });
  const next = coverCard(game, { type: "COVER_CARD", playerId: "p1", cardId: "0-clubs-5", timestamp: 1 });
  assert.equal(next.lastAction?.firstCoverFallback, true);
});

test("可見狀態不洩漏其他玩家手牌與蓋牌內容", () => {
  const game = state({ turn: 2 });
  game.coveredCards.p2 = [card("diamonds", "K")];
  const visible = getVisibleSevensState(game, "p1");
  assert.equal("hands" in visible, false);
  assert.equal("coveredCards" in visible, false);
  assert.equal(visible.coveredCounts.p2, 1);
  assert.deepEqual(visible.ownCoveredCards, []);
});

test("電腦玩家只會回傳合法動作", () => {
  const game = state({ hands: { p1: [card("spades", "7"), card("hearts", "7")], p2: [card("clubs", "A")], p3: [card("clubs", "A")], p4: [card("clubs", "A")] } });
  const move = calculateBotMove(game, "p1", "hard", () => 0);
  assert.deepEqual(move, { type: "PLAY_CARD", cardId: "0-spades-7" });
});
