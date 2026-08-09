import { Encoder } from "@colyseus/schema";
import {
  BigTwoRoomStateSchema,
  PublicBigTwoCard,
  PublicBigTwoPlayer
} from "./BigTwoRoomState";

function encodePendingPatch(encoder: Encoder<BigTwoRoomStateSchema>, label: string) {
  try {
    const patch = encoder.encode();
    encoder.discardChanges();
    return patch;
  } catch (error) {
    throw new Error(`Big Two Schema serialization failed during ${label}.`, { cause: error });
  }
}

const state = new BigTwoRoomStateSchema();
const encoder = new Encoder(state);

encoder.encodeAll();
encoder.discardChanges();

const player = new PublicBigTwoPlayer();
player.id = "schema-check-player";
player.nickname = "Schema Check";
state.players.push(player);

const card = new PublicBigTwoCard();
card.id = "clubs-3";
card.rank = "3";
card.suit = "clubs";
state.lastCards.push(card);
state.winnerIds.push(player.id);

const populatedPatch = encodePendingPatch(encoder, "collection insertion");
if (populatedPatch.length === 0) {
  throw new Error("Big Two Schema collection insertion produced an empty patch.");
}

state.players.clear();
state.lastCards.clear();
state.winnerIds.clear();

const clearedPatch = encodePendingPatch(encoder, "collection clearing");
if (clearedPatch.length === 0) {
  throw new Error("Big Two Schema collection clearing produced an empty patch.");
}

console.log("Big Two Schema serialization check passed.");
