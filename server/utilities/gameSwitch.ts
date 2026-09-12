import { matchMaker, type Room } from "colyseus";
import type { GameSwitchedEvent, PokerGameId } from "../messages/gameFlowMessages";

type SwitchPlayer = { id: string; type?: string };
const transferRoomTimers = new WeakMap<Room, ReturnType<typeof setTimeout>>();

const definitions: Record<PokerGameId, { roomType: string; min: number; max: number; bots: boolean }> = {
  big2: { roomType: "big_two", min: 3, max: 4, bots: true },
  sevens: { roomType: "sevens", min: 3, max: 5, bots: true },
  "red-dot": { roomType: "pick_red_points", min: 2, max: 4, bots: true },
  "ninety-nine": { roomType: "ninety_nine", min: 2, max: 6, bots: true },
  liar: { roomType: "bluff", min: 3, max: 6, bots: false },
  "heart-attack": { roomType: "heart_attack", min: 2, max: 6, bots: false },
  "old-maid": { roomType: "old_maid", min: 3, max: 6, bots: false }
};

export async function createSwitchedGameRoom(options: {
  sourceGameId: PokerGameId;
  targetGameId: PokerGameId;
  roomCode: string;
  players: Iterable<SwitchPlayer>;
  hostClientId: string;
}): Promise<GameSwitchedEvent> {
  if (options.targetGameId === options.sourceGameId) throw new Error("Please use play again for the same game.");
  const target = definitions[options.targetGameId];
  if (!target) throw new Error("Unsupported game.");

  const players = Array.from(options.players);
  const humanCount = players.filter((player) => player.type !== "bot").length;
  const sourceBotCount = players.length - humanCount;
  if (humanCount > target.max) throw new Error("This game cannot fit all current players.");

  const botCount = target.bots ? Math.min(sourceBotCount, target.max - humanCount) : 0;
  const maxPlayers = Math.min(target.max, Math.max(target.min, humanCount + botCount));
  const room = await matchMaker.createRoom(target.roomType, {
    roomCode: options.roomCode,
    maxPlayers,
    bots: botCount,
    difficulty: "normal",
    matchMode: "single",
    mode: options.targetGameId === "sevens" && maxPlayers > 4 ? "double-deck-race" : undefined,
    hostClientId: sanitizeClientId(options.hostClientId),
    transferredRoom: true
  });

  return { type: "GAME_SWITCHED", gameId: options.targetGameId, roomId: room.roomId, roomCode: options.roomCode };
}

export function holdTransferredRoom(room: Room, shouldHold: boolean | undefined) {
  if (!shouldHold) return;
  room.autoDispose = false;
  const timer = setTimeout(() => {
    transferRoomTimers.delete(room);
    room.autoDispose = true;
  }, 15_000);
  transferRoomTimers.set(room, timer);
}

export function activateTransferredRoom(room: Room) {
  const timer = transferRoomTimers.get(room);
  if (!timer) return;
  clearTimeout(timer);
  transferRoomTimers.delete(room);
  room.autoDispose = true;
}

export function sanitizeClientId(value?: string) {
  return value?.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || undefined;
}

export function transferredHost(clientId: string | undefined, preferredHostClientId: string | undefined, hasHumanPlayer: boolean) {
  if (preferredHostClientId) return clientId === preferredHostClientId;
  return !hasHumanPlayer;
}
