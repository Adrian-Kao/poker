import { Client, Room } from "colyseus";
import {
  RECONNECT_WINDOW_SECONDS,
  TURN_DURATION_MS,
  applyNinetyNineAction,
  chooseNinetyNineBotAction,
  createNinetyNineGame,
  eliminatePlayerIfStuck,
  getBotThinkDelayMs,
  getLegalActions,
  type BotDifficulty,
  type NinetyNineAction,
  type NinetyNineState
} from "../../lib/games/ninety-nine";
import { NinetyNineRoomStateSchema, syncNinetyNinePublicState, type LobbyNinetyNinePlayer } from "../schema/NinetyNineRoomState";
import type { NinetyNineClientMessage, NinetyNineServerEvent } from "../messages/ninetyNineMessages";
import { toCardPlayedEvent } from "../messages/ninetyNineMessages";
import { DefaultRoomScheduler, type RoomScheduler, type ScheduledTask } from "../utilities/scheduler";

type NinetyNineRoomControllerOptions = {
  roomCode?: string;
  maxPlayers?: number;
  initialBotCount?: number;
  botDifficulty?: BotDifficulty;
  scheduler?: RoomScheduler;
  random?: () => number;
  emit?: (event: NinetyNineServerEvent, playerId?: string) => void;
  onGameStarted?: () => void;
};

export class NinetyNineRoomController {
  readonly publicState = new NinetyNineRoomStateSchema();
  readonly scheduler: RoomScheduler;
  private readonly random: () => number;
  private readonly emit: (event: NinetyNineServerEvent, playerId?: string) => void;
  private readonly onGameStarted: () => void;
  private lobbyPlayers: LobbyNinetyNinePlayer[] = [];
  private gameState: NinetyNineState | null = null;
  private actionIds = new Set<string>();
  private botCounter = 1;
  private turnTask: ScheduledTask | null = null;
  private botTask: ScheduledTask | null = null;
  private turnToken = 0;
  private initialBotCount: number;
  private botDifficulty: BotDifficulty;

  constructor(options: NinetyNineRoomControllerOptions = {}) {
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

    const player: LobbyNinetyNinePlayer = {
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
    if (this.lobbyPlayers.length < 2) throw new Error("Ninety-nine needs at least 2 players.");
    if (!this.lobbyPlayers.every((player) => player.type === "bot" || (player.connected && player.ready))) {
      throw new Error("All joined players must be ready.");
    }

    this.gameState = createNinetyNineGame({
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

  playCard(sessionId: string, actionId: string, cardId: string, choice: NinetyNineAction["choice"]) {
    this.requireFreshAction(actionId);
    if (!this.gameState) throw new Error("Game is not started.");
    const player = this.requireHuman(sessionId);
    this.applyAction({ type: "PLAY_CARD", playerId: player.id, cardId, choice }, false);
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

  processDue(token = this.turnToken) {
    if (!this.gameState || token !== this.turnToken || this.gameState.phase === "finished") return;
    const currentPlayer = this.lobbyPlayers.find((player) => player.id === this.gameState?.currentPlayerId);
    if (!currentPlayer) return;

    const legal = getLegalActions(this.gameState, currentPlayer.id);
    if (legal.length === 0) {
      const before = this.gameState;
      this.gameState = eliminatePlayerIfStuck(this.gameState, currentPlayer.id);
      this.emitEliminations(before);
      this.startTurn();
      return;
    }

    const action = currentPlayer.type === "bot"
      ? chooseNinetyNineBotAction(this.gameState, currentPlayer.id, currentPlayer.botDifficulty as BotDifficulty | undefined, this.random)
      : legal[0];

    if (action) this.applyAction(action, true);
  }

  dispose() {
    this.cancelTimers();
  }

  close() {
    this.cancelTimers();
  }

  private applyAction(action: NinetyNineAction, system: boolean) {
    if (!this.gameState) return;
    const before = this.gameState;
    this.gameState = applyNinetyNineAction(this.gameState, action, this.random, system);
    if (this.gameState.lastAction) this.emit(toCardPlayedEvent(this.gameState.lastAction));
    this.emitEliminations(before);
    this.sendHands();
    this.startTurn();
  }

  private startTurn() {
    this.cancelTimers();
    if (!this.gameState) {
      this.syncPublic();
      return;
    }

    if (this.gameState.phase === "finished") {
      this.syncPublic();
      if (this.gameState.winnerId) this.emit({ type: "GAME_FINISHED", winnerId: this.gameState.winnerId });
      return;
    }

    this.turnToken += 1;
    const token = this.turnToken;
    this.publicState.turnDeadline = this.scheduler.now() + TURN_DURATION_MS;
    this.syncPublic();
    this.sendHands();
    this.emit({ type: "TURN_CHANGED", playerId: this.gameState.currentPlayerId ?? "", deadline: this.publicState.turnDeadline });
    this.turnTask = this.scheduler.setTimeout(() => this.processDue(token), TURN_DURATION_MS);

    const current = this.lobbyPlayers.find((player) => player.id === this.gameState?.currentPlayerId);
    if (current?.type === "bot") {
      const delay = getBotThinkDelayMs(current.botDifficulty as BotDifficulty | undefined ?? "normal", this.random);
      this.botTask = this.scheduler.setTimeout(() => this.processDue(token), delay);
    }
  }

  private sendHands() {
    this.lobbyPlayers.filter((player) => player.type === "human").forEach((player) => this.sendHand(player.id));
  }

  private sendHand(playerId: string) {
    if (!this.gameState) return;
    this.emit({
      type: "HAND_UPDATED",
      cards: this.gameState.hands[playerId] ?? [],
      legalActions: getLegalActions(this.gameState, playerId)
    }, playerId);
  }

  private emitEliminations(before: NinetyNineState) {
    if (!this.gameState) return;
    this.gameState.players.forEach((player) => {
      const previous = before.players.find((item) => item.id === player.id);
      if (previous?.status === "playing" && player.status === "eliminated") {
        this.emit({ type: "PLAYER_ELIMINATED", playerId: player.id, reason: "no-legal-action" });
      }
    });
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
    syncNinetyNinePublicState(this.publicState, this.gameState, this.lobbyPlayers, this.publicState.turnDeadline);
    this.publicState.maxPlayers = this.publicState.maxPlayers || 4;
  }

  private cancelTimers() {
    this.scheduler.clear(this.turnTask);
    this.scheduler.clear(this.botTask);
    this.turnTask = null;
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

export class NinetyNineRoom extends Room {
  private controller!: NinetyNineRoomController;
  private closingRoom = false;

  onCreate(options: { maxPlayers?: number; bots?: number; difficulty?: string } = {}) {
    this.controller = new NinetyNineRoomController({
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

    this.onMessage("SET_READY", (client, message: NinetyNineClientMessage) => this.handleMessage(client, message));
    this.onMessage("START_GAME", (client, message: NinetyNineClientMessage) => this.handleMessage(client, message));
    this.onMessage("ADD_BOT", (client, message: NinetyNineClientMessage) => this.handleMessage(client, message));
    this.onMessage("REMOVE_BOT", (client, message: NinetyNineClientMessage) => this.handleMessage(client, message));
    this.onMessage("PLAY_CARD", (client, message: NinetyNineClientMessage) => this.handleMessage(client, message));
    this.onMessage("PLAY_AGAIN", (client, message: NinetyNineClientMessage) => this.handleMessage(client, message));
    this.onMessage("CLOSE_ROOM", (client, message: NinetyNineClientMessage) => this.handleMessage(client, message));
  }

  onJoin(client: Client, options: { nickname?: string } = {}) {
    try {
      this.controller.addHuman(client.sessionId, options.nickname ?? "玩家");
    } catch (error) {
      client.send("ninety-nine:event", reject(undefined, error));
      client.leave();
    }
  }

  async onLeave(client: Client, consented?: boolean) {
    this.controller.markDisconnected(client.sessionId);
    if (this.closingRoom) return;

    if (!consented) {
      try {
        await this.allowReconnection(client, RECONNECT_WINDOW_SECONDS);
        this.controller.markReconnected(client.sessionId);
      } catch {
        this.controller.markDisconnected(client.sessionId);
      }
    }
  }

  onDispose() {
    this.controller.dispose();
  }

  private handleMessage(client: Client, message: NinetyNineClientMessage) {
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
        case "PLAY_CARD":
          this.controller.playCard(client.sessionId, message.actionId, message.cardId, message.choice);
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
      client.send("ninety-nine:event", reject(message.actionId, error));
    }
  }

  private emitEvent(event: NinetyNineServerEvent, playerId?: string) {
    if (!playerId) {
      this.broadcast("ninety-nine:event", event);
      return;
    }

    const client = this.clients.find((item) => `player-${item.sessionId}` === playerId);
    client?.send("ninety-nine:event", event);
  }

  private closeRoom() {
    if (this.closingRoom) return;
    this.closingRoom = true;
    this.controller.close();
    this.lock();
    this.broadcast("ninety-nine:event", { type: "ROOM_CLOSED", reason: "left" });
    this.disconnect();
  }
}

function reject(actionId: string | undefined, error: unknown): NinetyNineServerEvent {
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
  return Math.max(2, Math.min(6, Math.floor(value)));
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

