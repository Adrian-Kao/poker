import { Client, Room } from "colyseus";
import {
  BLUFF_REACTION_WINDOW_MS,
  BLUFF_RESULT_NOTICE_MS,
  BLUFF_TURN_MS,
  chooseBluffBotPlay,
  chooseBluffBotReaction,
  createBluffGame,
  expireReactionWindow,
  getBluffBotThinkDelayMs,
  playBluffCards,
  resolveRoundResult,
  submitBluffReaction,
  type BluffState,
  type BotDifficulty
} from "../../lib/games/bluff";
import { BluffRoomStateSchema, syncBluffPublicState, type LobbyBluffPlayer } from "../schema/BluffRoomState";
import type { BluffClientMessage, BluffServerEvent } from "../messages/bluffMessages";
import { DefaultRoomScheduler, type RoomScheduler, type ScheduledTask } from "../utilities/scheduler";

type BluffRoomControllerOptions = {
  roomCode?: string;
  maxPlayers?: number;
  initialBotCount?: number;
  botDifficulty?: BotDifficulty;
  scheduler?: RoomScheduler;
  random?: () => number;
  emit?: (event: BluffServerEvent, playerId?: string) => void;
  onGameStarted?: () => void;
};

export class BluffRoomController {
  readonly publicState = new BluffRoomStateSchema();
  readonly scheduler: RoomScheduler;
  private readonly random: () => number;
  private readonly emit: (event: BluffServerEvent, playerId?: string) => void;
  private readonly onGameStarted: () => void;
  private lobbyPlayers: LobbyBluffPlayer[] = [];
  private gameState: BluffState | null = null;
  private actionIds = new Set<string>();
  private botCounter = 1;
  private turnTask: ScheduledTask | null = null;
  private reactionTask: ScheduledTask | null = null;
  private resultTask: ScheduledTask | null = null;
  private botTask: ScheduledTask | null = null;
  private turnDeadline = 0;
  private reactionDeadline = 0;
  private initialBotCount: number;
  private botDifficulty: BotDifficulty;

  constructor(options: BluffRoomControllerOptions = {}) {
    this.scheduler = options.scheduler ?? new DefaultRoomScheduler();
    this.random = options.random ?? Math.random;
    this.emit = options.emit ?? (() => undefined);
    this.onGameStarted = options.onGameStarted ?? (() => undefined);
    this.publicState.roomCode = options.roomCode ?? createRoomCode(this.random);
    this.publicState.maxPlayers = clampMaxPlayers(options.maxPlayers ?? 4);
    this.initialBotCount = Math.max(0, Math.floor(options.initialBotCount ?? 0));
    this.botDifficulty = options.botDifficulty ?? "normal";
    this.syncPublic();
  }

  get state() {
    return this.gameState;
  }

  addHuman(sessionId: string, nickname: string) {
    if (this.gameState) throw new Error("Game already started.");
    if (this.lobbyPlayers.length >= this.publicState.maxPlayers) throw new Error("Room is full.");
    if (this.lobbyPlayers.some((player) => player.sessionId === sessionId)) return;

    const player: LobbyBluffPlayer = {
      id: `player-${sessionId}`,
      nickname: sanitizeNickname(nickname),
      seat: this.lobbyPlayers.length,
      type: "human",
      sessionId,
      connected: true,
      ready: false,
      host: !this.lobbyPlayers.some((item) => item.type === "human")
    };
    this.lobbyPlayers.push(player);

    while (this.initialBotCount > 0 && this.lobbyPlayers.length < this.publicState.maxPlayers) {
      this.addBotInternal(this.botDifficulty);
      this.initialBotCount -= 1;
    }

    this.syncPublic();
    this.sendHand(player.id);
  }

  markDisconnected(sessionId: string) {
    const player = this.lobbyPlayers.find((item) => item.sessionId === sessionId);
    if (player) {
      player.connected = false;
      if (!this.gameState) player.ready = false;
    }
    this.promoteHostIfNeeded();
    this.syncPublic();
  }

  markReconnected(sessionId: string) {
    const player = this.lobbyPlayers.find((item) => item.sessionId === sessionId);
    if (player) {
      player.connected = true;
      this.sendHand(player.id);
    }
    this.syncPublic();
  }

  setReady(sessionId: string, actionId: string, ready: boolean) {
    this.requireFreshAction(actionId);
    if (this.gameState) throw new Error("Game already started.");
    const player = this.requireHuman(sessionId);
    player.ready = ready;
    this.syncPublic();
  }

  addBot(sessionId: string, actionId: string, difficulty: BotDifficulty) {
    this.requireFreshAction(actionId);
    this.requireHost(sessionId);
    if (this.gameState) throw new Error("Cannot add bot after start.");
    if (this.lobbyPlayers.length >= this.publicState.maxPlayers) throw new Error("Room is full.");
    this.addBotInternal(difficulty);
    this.syncPublic();
  }

  removeBot(sessionId: string, actionId: string, botId: string) {
    this.requireFreshAction(actionId);
    this.requireHost(sessionId);
    if (this.gameState) throw new Error("Cannot remove bot after start.");
    this.lobbyPlayers = this.lobbyPlayers.filter((player) => !(player.type === "bot" && player.id === botId)).map((player, seat) => ({ ...player, seat }));
    this.syncPublic();
  }

  startGame(sessionId: string, actionId: string) {
    this.requireFreshAction(actionId);
    this.requireHost(sessionId);
    if (this.gameState) throw new Error("Game already started.");
    if (this.lobbyPlayers.length < 3) throw new Error("Bluff needs at least 3 players.");
    if (!this.lobbyPlayers.every((player) => player.type === "bot" || (player.connected && player.ready))) {
      throw new Error("All joined players must be ready.");
    }

    this.gameState = createBluffGame({
      players: this.lobbyPlayers.map((player) => ({
        id: player.id,
        nickname: player.nickname,
        type: player.type,
        botDifficulty: player.botDifficulty as BotDifficulty | undefined,
        connected: player.connected
      })),
      random: this.random
    });
    this.onGameStarted();
    this.emit({ type: "GAME_STARTED" });
    this.startTurn();
  }

  playCards(sessionId: string, actionId: string, cardIds: string[], roundClaimRank: string) {
    this.requireFreshAction(actionId);
    if (!this.gameState) throw new Error("Game is not started.");
    const player = this.requireHuman(sessionId);
    this.applyPlay(player.id, cardIds, roundClaimRank as never);
  }

  react(sessionId: string, actionId: string, choice: "trust" | "challenge") {
    this.requireFreshAction(actionId);
    if (!this.gameState) throw new Error("Game is not started.");
    const player = this.requireHuman(sessionId);
    const before = this.gameState;
    this.gameState = submitBluffReaction(this.gameState, player.id, choice, actionId, this.scheduler.now());
    this.emit({ type: "REACTION_RECORDED", playerId: player.id, choice });
    this.afterStateChange(before);
  }

  playAgain(sessionId: string, actionId: string) {
    this.requireFreshAction(actionId);
    this.requireHost(sessionId);
    this.cancelTimers();
    this.gameState = null;
    this.publicState.round += 1;
    this.lobbyPlayers = this.lobbyPlayers
      .filter((player) => player.type === "bot" || player.connected)
      .map((player, seat) => ({ ...player, seat, ready: player.type === "bot" }));
    this.promoteHostIfNeeded();
    this.syncPublic();
  }

  processDue() {
    if (!this.gameState) return;
    const before = this.gameState;
    const now = this.scheduler.now();

    if (this.gameState.phase === "reaction-window") {
      this.gameState = expireReactionWindow(this.gameState, now);
      this.afterStateChange(before);
      return;
    }

    if (this.gameState.phase === "round-result") {
      this.gameState = resolveRoundResult(this.gameState, now);
      this.afterStateChange(before);
      return;
    }

    if (this.gameState.phase === "playing" && this.gameState.currentPlayerId) {
      const current = this.lobbyPlayers.find((player) => player.id === this.gameState?.currentPlayerId);
      if (current?.type === "bot") {
        const action = chooseBluffBotPlay(this.gameState, current.id, current.botDifficulty as BotDifficulty | undefined, this.random);
        if (action?.type === "PLAY_CARDS") this.applyPlay(current.id, action.cardIds, action.roundClaimRank ?? "A");
      }
    }
  }

  dispose() {
    this.cancelTimers();
  }

  close() {
    this.cancelTimers();
  }

  private applyPlay(playerId: string, cardIds: string[], roundClaimRank: string) {
    if (!this.gameState) return;
    const before = this.gameState;
    this.gameState = playBluffCards(this.gameState, playerId, cardIds, roundClaimRank as never, this.scheduler.now());
    const batch = this.gameState.batches.at(-1);
    if (batch) {
      this.emit({
        type: "CARDS_PLAYED",
        batchId: batch.id,
        playerId,
        roundClaimRank: batch.claimedRank,
        addedCount: batch.addedCount,
        centerPileCount: this.gameState.centerPile.length
      });
    }
    this.afterStateChange(before);
  }

  private afterStateChange(before: BluffState) {
    this.sendHands();
    if (!this.gameState) return;
    if (before.phase !== "round-result" && this.gameState.phase === "round-result" && this.gameState.roundResult) {
      this.emit({ type: "ROUND_RESULT", result: this.gameState.roundResult });
    }
    if (before.phase === "reaction-window" && this.gameState.phase === "reaction-window") {
      this.syncPublic();
      return;
    }
    this.scheduleNext();
  }

  private startTurn() {
    this.scheduleNext();
  }

  private scheduleNext() {
    this.cancelTimers();
    if (!this.gameState) {
      this.syncPublic();
      return;
    }

    if (this.gameState.phase === "finished") {
      this.turnDeadline = 0;
      this.reactionDeadline = 0;
      this.syncPublic();
      if (this.gameState.winnerId) this.emit({ type: "GAME_FINISHED", winnerId: this.gameState.winnerId });
      return;
    }

    const now = this.scheduler.now();
    if (this.gameState.phase === "reaction-window") {
      this.reactionDeadline = now + BLUFF_REACTION_WINDOW_MS;
      this.turnDeadline = 0;
      this.reactionTask = this.scheduler.setTimeout(() => this.processDue(), BLUFF_REACTION_WINDOW_MS);
      this.scheduleBotReactions();
    } else if (this.gameState.phase === "round-result") {
      this.reactionDeadline = 0;
      this.turnDeadline = 0;
      this.resultTask = this.scheduler.setTimeout(() => this.processDue(), BLUFF_RESULT_NOTICE_MS);
    } else {
      this.reactionDeadline = 0;
      this.turnDeadline = now + BLUFF_TURN_MS;
      this.turnTask = this.scheduler.setTimeout(() => this.processDue(), BLUFF_TURN_MS);
      const current = this.lobbyPlayers.find((player) => player.id === this.gameState?.currentPlayerId);
      if (current?.type === "bot") {
        this.botTask = this.scheduler.setTimeout(() => this.processDue(), getBluffBotThinkDelayMs(current.botDifficulty as BotDifficulty | undefined, this.random));
      }
      if (this.gameState.currentPlayerId) this.emit({ type: "TURN_CHANGED", playerId: this.gameState.currentPlayerId, deadline: this.turnDeadline });
    }

    this.syncPublic();
    this.sendHands();
  }

  private scheduleBotReactions() {
    if (!this.gameState) return;
    const batch = this.gameState.batches.at(-1);
    if (!batch) return;
    const bots = this.lobbyPlayers.filter((player) => player.type === "bot" && player.id !== batch.playerId);
    bots.forEach((bot, index) => {
      const delay = 380 + index * 220 + Math.floor(this.random() * 260);
      this.scheduler.setTimeout(() => {
        if (!this.gameState || this.gameState.phase !== "reaction-window") return;
        const before = this.gameState;
        const actionId = `bot-react-${bot.id}-${this.scheduler.now()}`;
        const choice = chooseBluffBotReaction(this.gameState, bot.id, bot.botDifficulty as BotDifficulty | undefined, this.random);
        this.gameState = submitBluffReaction(this.gameState, bot.id, choice, actionId, this.scheduler.now());
        this.emit({ type: "REACTION_RECORDED", playerId: bot.id, choice });
        this.afterStateChange(before);
      }, delay);
    });
  }

  private sendHands() {
    this.lobbyPlayers.filter((player) => player.type === "human").forEach((player) => this.sendHand(player.id));
  }

  private sendHand(playerId: string) {
    if (!this.gameState) return;
    this.emit({ type: "HAND_UPDATED", cards: this.gameState.hands[playerId] ?? [] }, playerId);
  }

  private addBotInternal(difficulty: BotDifficulty) {
    const number = this.botCounter;
    this.botCounter += 1;
    this.lobbyPlayers.push({
      id: `bot-${number}`,
      nickname: `電腦${number}`,
      seat: this.lobbyPlayers.length,
      type: "bot",
      botDifficulty: difficulty,
      connected: true,
      ready: true,
      host: false
    });
  }

  private syncPublic() {
    syncBluffPublicState(this.publicState, this.gameState, this.lobbyPlayers, this.turnDeadline, this.reactionDeadline);
    this.publicState.maxPlayers = this.publicState.maxPlayers || 4;
  }

  private cancelTimers() {
    this.scheduler.clear(this.turnTask);
    this.scheduler.clear(this.reactionTask);
    this.scheduler.clear(this.resultTask);
    this.scheduler.clear(this.botTask);
    this.turnTask = null;
    this.reactionTask = null;
    this.resultTask = null;
    this.botTask = null;
  }

  private requireFreshAction(actionId: string) {
    if (!actionId) throw new Error("Missing actionId.");
    if (this.actionIds.has(actionId)) throw new Error("Duplicate actionId.");
    this.actionIds.add(actionId);
  }

  private requireHuman(sessionId: string) {
    const player = this.lobbyPlayers.find((item) => item.sessionId === sessionId);
    if (!player || player.type !== "human") throw new Error("Unknown player.");
    return player;
  }

  private requireHost(sessionId: string) {
    const player = this.requireHuman(sessionId);
    if (!player.host) throw new Error("Only the host can do this.");
    return player;
  }

  private promoteHostIfNeeded() {
    if (this.lobbyPlayers.some((player) => player.host && player.connected)) return;
    const nextHost = this.lobbyPlayers.find((player) => player.type === "human" && player.connected);
    this.lobbyPlayers = this.lobbyPlayers.map((player) => ({ ...player, host: player.id === nextHost?.id }));
  }
}

export class BluffRoom extends Room {
  private controller!: BluffRoomController;
  private closingRoom = false;

  onCreate(options: { maxPlayers?: number; bots?: number; difficulty?: string } = {}) {
    this.controller = new BluffRoomController({
      maxPlayers: options.maxPlayers,
      initialBotCount: Number(options.bots ?? 0),
      botDifficulty: parseDifficulty(options.difficulty),
      emit: (event, playerId) => this.emitEvent(event, playerId),
      onGameStarted: () => this.lock()
    });
    const roomCode = this.controller.publicState.roomCode;
    this.setMetadata({ roomCode });
    const listing = (this as unknown as { listing?: Record<string, unknown> }).listing;
    if (listing) listing.roomCode = roomCode;
    this.setState(this.controller.publicState);

    this.onMessage("SET_READY", (client, message: BluffClientMessage) => this.handleMessage(client, message));
    this.onMessage("START_GAME", (client, message: BluffClientMessage) => this.handleMessage(client, message));
    this.onMessage("ADD_BOT", (client, message: BluffClientMessage) => this.handleMessage(client, message));
    this.onMessage("REMOVE_BOT", (client, message: BluffClientMessage) => this.handleMessage(client, message));
    this.onMessage("PLAY_CARDS", (client, message: BluffClientMessage) => this.handleMessage(client, message));
    this.onMessage("REACT_TO_CLAIM", (client, message: BluffClientMessage) => this.handleMessage(client, message));
    this.onMessage("PLAY_AGAIN", (client, message: BluffClientMessage) => this.handleMessage(client, message));
    this.onMessage("CLOSE_ROOM", (client, message: BluffClientMessage) => this.handleMessage(client, message));
  }

  onJoin(client: Client, options: { nickname?: string } = {}) {
    try {
      this.controller.addHuman(client.sessionId, options.nickname ?? "玩家");
    } catch (error) {
      client.send("bluff:event", reject(undefined, error));
      client.leave();
    }
  }

  async onLeave(client: Client, consented?: boolean) {
    this.controller.markDisconnected(client.sessionId);
    if (this.closingRoom) return;

    if (!consented) {
      try {
        await this.allowReconnection(client, 30);
        this.controller.markReconnected(client.sessionId);
      } catch {
        this.controller.markDisconnected(client.sessionId);
      }
    }
  }

  onDispose() {
    this.controller.dispose();
  }

  private handleMessage(client: Client, message: BluffClientMessage) {
    try {
      switch (message.type) {
        case "SET_READY":
          this.controller.setReady(client.sessionId, message.actionId, message.ready);
          break;
        case "START_GAME":
          this.controller.startGame(client.sessionId, message.actionId);
          break;
        case "ADD_BOT":
          this.controller.addBot(client.sessionId, message.actionId, message.difficulty);
          break;
        case "REMOVE_BOT":
          this.controller.removeBot(client.sessionId, message.actionId, message.botId);
          break;
        case "PLAY_CARDS":
          this.controller.playCards(client.sessionId, message.actionId, message.cardIds, message.roundClaimRank);
          break;
        case "REACT_TO_CLAIM":
          this.controller.react(client.sessionId, message.actionId, message.choice);
          break;
        case "PLAY_AGAIN":
          this.unlock();
          this.controller.playAgain(client.sessionId, message.actionId);
          break;
        case "CLOSE_ROOM":
          this.closeRoom();
          break;
      }
    } catch (error) {
      client.send("bluff:event", reject(message.actionId, error));
    }
  }

  private emitEvent(event: BluffServerEvent, playerId?: string) {
    if (!playerId) {
      this.broadcast("bluff:event", event);
      return;
    }
    const client = this.clients.find((item) => `player-${item.sessionId}` === playerId);
    client?.send("bluff:event", event);
  }

  private closeRoom() {
    if (this.closingRoom) return;
    this.closingRoom = true;
    this.controller.close();
    this.lock();
    this.broadcast("bluff:event", { type: "ROOM_CLOSED", reason: "left" });
    this.disconnect();
  }
}

function reject(actionId: string | undefined, error: unknown): BluffServerEvent {
  return {
    type: "ACTION_REJECTED",
    actionId,
    reason: error instanceof Error ? error.message : "Action rejected."
  };
}

function createRoomCode(random: () => number) {
  return String(Math.floor(100000 + random() * 900000));
}

function clampMaxPlayers(value: number) {
  if (!Number.isFinite(value)) return 4;
  return Math.max(3, Math.min(6, Math.floor(value)));
}

function sanitizeNickname(value: string) {
  const trimmed = value.trim();
  return trimmed.slice(0, 16) || "玩家";
}

function parseDifficulty(value?: string): BotDifficulty {
  if (value === "簡單" || value === "easy") return "easy";
  if (value === "困難" || value === "hard") return "hard";
  return "normal";
}
