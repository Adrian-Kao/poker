import assert from "node:assert/strict";
import test from "node:test";
import {
  BOT_PLAYER_NAMES,
  getBotPlayerName,
  getBotPlayerNameForDifficulty
} from "../../lib/games/core/botNames";

test("bot player names are configured by bot order", () => {
  assert.equal(getBotPlayerName(1), BOT_PLAYER_NAMES.bot1);
  assert.equal(getBotPlayerName(2), BOT_PLAYER_NAMES.bot2);
  assert.equal(getBotPlayerName(3), BOT_PLAYER_NAMES.bot3);
});

test("bot player names fall back to numbered names when not configured", () => {
  assert.equal(getBotPlayerName(99), "電腦99");
});

test("bot1 is reserved for hard difficulty", () => {
  assert.equal(getBotPlayerNameForDifficulty(1, "hard", () => 0), BOT_PLAYER_NAMES.bot1);
  assert.equal(getBotPlayerNameForDifficulty(4, "hard", () => 0, [BOT_PLAYER_NAMES.bot2]), BOT_PLAYER_NAMES.bot1);
  assert.notEqual(getBotPlayerNameForDifficulty(2, "hard", () => 0, [BOT_PLAYER_NAMES.bot1]), BOT_PLAYER_NAMES.bot1);
  assert.notEqual(getBotPlayerNameForDifficulty(1, "normal", () => 0), BOT_PLAYER_NAMES.bot1);
  assert.notEqual(getBotPlayerNameForDifficulty(1, "easy", () => 0), BOT_PLAYER_NAMES.bot1);
});

test("non-hard bot names are randomly chosen without bot1", () => {
  assert.equal(getBotPlayerNameForDifficulty(1, "normal", () => 0), BOT_PLAYER_NAMES.bot2);
  assert.equal(getBotPlayerNameForDifficulty(1, "easy", () => 0.999), BOT_PLAYER_NAMES.bot8);
});

test("non-hard bot names avoid names already in the room before repeating", () => {
  assert.equal(
    getBotPlayerNameForDifficulty(1, "normal", () => 0, [BOT_PLAYER_NAMES.bot2, BOT_PLAYER_NAMES.bot3]),
    BOT_PLAYER_NAMES.bot4
  );
});
