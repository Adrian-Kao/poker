import { Client, Room } from "colyseus";
import {
  RESULT_NOTICE_MS,
  RECONNECT_WINDOW_SECONDS,
  advanceAutoPlay,
  createHeartAttackGame,
  resolveRoundResult,
  resolveSlapWindow,
  submitSlap,
  type BotDifficulty,
  type CreateHeartAttackPlayerInput,
  type HeartAttackState
} from "../../lib/games/heart-attack";
import { getBotPlayerNameForDifficulty } from "../../lib/games/core/botNames";
import { HeartAttackRoomStateSchema, PublicHeartAttackPlayer, syncPublicState } from "../schema/HeartAttackRoomState";
import type { HeartAttackClientMessage, HeartAttackServerEvent } from "../messages/heartAttackMessages";
import { toPenaltyNotice } from "../messages/heartAttackMessages";
import { DefaultRoomScheduler, type RoomScheduler, type ScheduledTask } from "../utilities/scheduler";

type LobbyPlayer = CreateHeartAttackPlayerInput & {
  sessionId?: string;
  clientId?: string;
  connected: boolean;
  ready: boolean;
};

export type HeartAttackRoomControllerOptions = {
  roomCode?: string;
  maxPlayers?: number;
  scheduler?: RoomScheduler;
  random?: () => number;
  emit?: (event: HeartAttackServerEvent) => void;
  onGameStarted?: () => void;
};

export class HeartAttackRoomController {
  readonly publicState = new HeartAttackRoomStateSchema();
  readonly scheduler: RoomScheduler;
  private readonly random: () => number;
  private readonly emit: (event: HeartAttackServerEvent) => void;
  private readonly onGameStarted: () => void;
  private lobbyPlayers: LobbyPlayer[] = [];
  private gameState: HeartAttackState | null = null;
  private autoTask: ScheduledTask | null = null;
  private slapResolutionTask: ScheduledTask | null = null;
  private actionIds = new Set<string>();
  private botCounter = 1;

  constructor(options: HeartAttackRoomControllerOptions = {}) {
    this.scheduler = options.scheduler ?? new DefaultRoomScheduler();
    this.random = options.random ?? Math.random;
    this.emit = options.emit ?? (() => undefined);
    this.onGameStarted = options.onGameStarted ?? (() => undefined);
    this.publicState.roomCode = options.roomCode ?? createRoomCode(this.random);
    this.publicState.maxPlayers = clampMaxPlayers(options.maxPlayers ?? 4);
    this.syncPublic();
  }

  get state() {
    return this.gameState;
  }

  get players() {
    return this.lobbyPlayers.slice();
  }

  addHuman(sessionId: string, nickname: string, clientId?: string) {
    if (this.gameState) throw new Error("Game already started.");
    const existingPlayer = this.lobbyPlayers.find((player) => player.sessionId === sessionId || (clientId && player.clientId === clientId));
    if (existingPlayer) {
      existingPlayer.id = `player-${sessionId}`;
      existingPlayer.sessionId = sessionId;
      existingPlayer.clientId = clientId ?? existingPlayer.clientId;
      existingPlayer.nickname = sanitizeNickname(nickname);
      existingPlayer.connected = true;
      this.syncPublic();
      return;
    }
    if (this.lobbyPlayers.length >= this.publicState.maxPlayers) throw new Error("Room is full.");

    this.lobbyPlayers.push({
      id: `player-${sessionId}`,
      nickname: sanitizeNickname(nickname),
      type: "human",
      sessionId,
      clientId,
      connected: true,
      ready: false
    });
    this.syncPublic();
  }

  markDisconnected(sessionId: string) {
    const player = this.lobbyPlayers.find((item) => item.sessionId === sessionId);
    if (player) {
      player.connected = false;
      if (!this.gameState && player.type === "human") player.ready = false;
    }
    this.syncPublic();
  }

  markReconnected(sessionId: string) {
    const player = this.lobbyPlayers.find((item) => item.sessionId === sessionId);
    if (player) player.connected = true;
    this.syncPublic();
  }

  setReady(sessionIdOrPlayerId: string, actionId: string, ready: boolean) {
    this.requireFreshAction(actionId);
    if (this.gameState) throw new Error("Game already started.");

    const playerId = this.resolvePlayerId(sessionIdOrPlayerId);
    const player = this.lobbyPlayers.find((item) => item.id === playerId);
    if (!player || player.type !== "human") throw new Error("Only human players can change ready state.");

    player.ready = ready;
    this.syncPublic();
    this.maybeAutoStart();
  }

  addBot(actionId: string, difficulty: BotDifficulty) {
    this.requireFreshAction(actionId);
    if (this.gameState) throw new Error("Cannot add bot after start.");
    if (this.lobbyPlayers.length >= this.publicState.maxPlayers) throw new Error("Room is full.");

    const botNumber = this.botCounter;
    const botId = `bot-${botNumber}`;
    this.botCounter += 1;
    this.lobbyPlayers.push({
      id: botId,
      nickname: getBotPlayerNameForDifficulty(
        botNumber,
        difficulty,
        this.random,
        this.lobbyPlayers.map((player) => player.nickname)
      ),
      type: "bot",
      botDifficulty: difficulty,
      connected: true,
      ready: true
    });
    this.syncPublic();
    this.maybeAutoStart();
  }

  removeBot(actionId: string, botId: string) {
    this.requireFreshAction(actionId);
    if (this.gameState) throw new Error("Cannot remove bot after start.");
    this.lobbyPlayers = this.lobbyPlayers.filter((player) => !(player.type === "bot" && player.id === botId));
    this.syncPublic();
  }

  startGame(actionId: string) {
    this.requireFreshAction(actionId);
    this.startGameIfReady();
  }

  slap(sessionIdOrPlayerId: string, actionId: string) {
    this.requireFreshAction(actionId);
    if (!this.gameState) throw new Error("Game is not started.");
    if (this.gameState.phase === "round-result" || this.gameState.phase === "finished") throw new Error("Cannot slap now.");

    const playerId = this.resolvePlayerId(sessionIdOrPlayerId);
    const before = this.gameState;
    this.gameState = submitSlap(this.gameState, playerId, this.scheduler.now());

    const latest = before.centerPile.at(-1);
    const response = this.gameState.slapResponses.at(-1);
    if (response?.valid && latest) {
      this.emit({ type: "SLAP_ACCEPTED", playerId, reactionMs: response.timestamp - latest.playedAt });
    }

    this.syncPublic();
    this.scheduleNext();
    this.emitRoundResultIfNeeded(before);
  }

  playAgain(actionId: string) {
    this.requireFreshAction(actionId);
    this.cancelTimers();
    this.gameState = null;
    this.publicState.round += 1;
    this.lobbyPlayers = this.lobbyPlayers
      .filter((player) => player.connected || player.type === "bot")
      .map((player) => ({ ...player, ready: player.type === "bot" }));
    this.syncPublic();
  }

  processDue() {
    if (!this.gameState) return;
    const before = this.gameState;
    const now = this.scheduler.now();

    if (before.slapDeadline !== null && now >= before.slapDeadline) {
      this.gameState = resolveSlapWindow(before, now);
      this.syncPublic();
      this.emitRoundResultIfNeeded(before);
      this.scheduleNext();
      return;
    }

    if (before.phase === "round-result") {
      this.gameState = resolveRoundResult(before, now);
      this.syncPublic();
      this.emitFinishIfNeeded(before);
      this.scheduleNext();
      return;
    }

    if (before.phase === "playing") {
      this.gameState = advanceAutoPlay(before, now);
      const last = this.gameState.centerPile.at(-1);
      if (last && last !== before.centerPile.at(-1)) {
        this.emit({ type: "CARD_PLAYED", playedCard: last });
      }
      this.syncPublic();
      this.emitFinishIfNeeded(before);
      this.scheduleNext();
    }
  }

  dispose() {
    this.cancelTimers();
  }

  private maybeAutoStart() {
    if (!this.canStart()) return;
    const actionId = `auto-start-${this.scheduler.now()}-${this.lobbyPlayers.length}`;
    this.actionIds.add(actionId);
    this.createGame();
  }

  private startGameIfReady() {
    if (this.gameState) throw new Error("Game already started.");
    if (this.lobbyPlayers.length < 3) throw new Error("Heart attack needs at least 3 players.");
    if (!this.allJoinedPlayersReady()) throw new Error("All joined players must be ready.");
    this.createGame();
  }

  private canStart() {
    return !this.gameState && this.lobbyPlayers.length >= 3 && this.allJoinedPlayersReady();
  }

  private allJoinedPlayersReady() {
    return this.lobbyPlayers.length > 0 && this.lobbyPlayers.every((player) => player.type === "bot" || (player.connected && player.ready));
  }

  private createGame() {
    if (this.gameState) throw new Error("Game already started.");

    this.gameState = createHeartAttackGame({
      players: this.lobbyPlayers.map((player) => ({
        id: player.id,
        nickname: player.nickname,
        type: player.type,
        botDifficulty: player.botDifficulty
      })),
      initialTimestamp: this.scheduler.now()
    });
    this.onGameStarted();
    this.emit({ type: "GAME_STARTED" });
    this.syncPublic();
    this.scheduleNext();
  }

  private scheduleNext() {
    this.scheduler.clear(this.autoTask);
    this.scheduler.clear(this.slapResolutionTask);
    this.autoTask = null;
    this.slapResolutionTask = null;

    if (!this.gameState || this.gameState.phase === "finished") return;

    const now = this.scheduler.now();
    if (this.gameState.phase === "slap-window") {
      const deadline = this.gameState.slapDeadline ?? now;
      this.slapResolutionTask = this.scheduler.setTimeout(() => this.processDue(), Math.max(0, deadline - now));
    } else if (this.gameState.slapDeadline !== null) {
      this.slapResolutionTask = this.scheduler.setTimeout(() => this.processDue(), Math.max(0, this.gameState.slapDeadline - now));
    }

    const dueAt = this.gameState.nextAutoPlayAt;
    if (dueAt !== null) {
      this.autoTask = this.scheduler.setTimeout(() => this.processDue(), Math.max(0, dueAt - now));
    }
  }

  private emitRoundResultIfNeeded(before: HeartAttackState) {
    if (!this.gameState || before.phase === this.gameState.phase || this.gameState.phase !== "round-result") return;
    if (this.gameState.roundResult) this.emit({ type: "ROUND_RESULT", result: this.gameState.roundResult });
    if (this.gameState.penaltyResult) {
      this.emit({ type: "PENALTY_NOTICE", notice: toPenaltyNotice(this.gameState.penaltyResult, RESULT_NOTICE_MS) });
    }
  }

  private emitFinishIfNeeded(before: HeartAttackState) {
    if (!this.gameState || before.phase === "finished" || this.gameState.phase !== "finished" || !this.gameState.winnerId) return;
    this.emit({ type: "GAME_FINISHED", winnerId: this.gameState.winnerId });
  }

  private resolvePlayerId(sessionIdOrPlayerId: string) {
    return this.lobbyPlayers.find((player) => player.sessionId === sessionIdOrPlayerId)?.id ?? sessionIdOrPlayerId;
  }

  private requireFreshAction(actionId: string) {
    if (!actionId) throw new Error("Missing actionId.");
    if (this.actionIds.has(actionId)) throw new Error("Duplicate actionId.");
    this.actionIds.add(actionId);
  }

  private syncPublic() {
    syncPublicState(this.publicState, this.gameState, new Set(this.lobbyPlayers.filter((player) => player.connected).map((player) => player.id)));
    if (!this.gameState) {
      this.publicState.players.clear();
      this.lobbyPlayers.forEach((player, seat) => {
        const publicPlayer = new PublicHeartAttackPlayer();
        publicPlayer.id = player.id;
        publicPlayer.nickname = player.nickname;
        publicPlayer.seat = seat;
        publicPlayer.type = player.type ?? "human";
        publicPlayer.status = "waiting";
        publicPlayer.connected = player.type === "bot" || player.connected;
        publicPlayer.ready = player.type === "bot" || player.ready;
        publicPlayer.cardsRemaining = 0;
        this.publicState.players.push(publicPlayer);
      });
      this.publicState.maxPlayers = this.publicState.maxPlayers || 4;
    }
  }

  private cancelTimers() {
    this.scheduler.clear(this.autoTask);
    this.scheduler.clear(this.slapResolutionTask);
    this.autoTask = null;
    this.slapResolutionTask = null;
  }
}

export class HeartAttackRoom extends Room {
  private controller!: HeartAttackRoomController;
  private closingRoom = false;

  onCreate(options: { maxPlayers?: number } = {}) {
    this.controller = new HeartAttackRoomController({
      maxPlayers: options.maxPlayers,
      emit: (event) => this.broadcast("heart-attack:event", event),
      onGameStarted: () => this.lock()
    });
    const roomCode = this.controller.publicState.roomCode;
    this.setMetadata({ roomCode });
    const listing = (this as unknown as { listing?: Record<string, unknown> }).listing;
    if (listing) listing.roomCode = roomCode;
    this.setState(this.controller.publicState);

    this.onMessage("SET_READY", (client, message: HeartAttackClientMessage) => this.handleMessage(client, message));
    this.onMessage("START_GAME", (client, message: HeartAttackClientMessage) => this.handleMessage(client, message));
    this.onMessage("ADD_BOT", (client, message: HeartAttackClientMessage) => this.handleMessage(client, message));
    this.onMessage("REMOVE_BOT", (client, message: HeartAttackClientMessage) => this.handleMessage(client, message));
    this.onMessage("SLAP", (client, message: HeartAttackClientMessage) => this.handleMessage(client, message));
    this.onMessage("PLAY_AGAIN", (client, message: HeartAttackClientMessage) => this.handleMessage(client, message));
    this.onMessage("CLOSE_ROOM", (client, message: HeartAttackClientMessage) => this.handleMessage(client, message));
  }

  onJoin(client: Client, options: { nickname?: string; clientId?: string } = {}) {
    try {
      this.controller.addHuman(client.sessionId, options.nickname ?? "玩家", sanitizeClientId(options.clientId));
    } catch (error) {
      client.send("heart-attack:event", reject(undefined, error));
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

  private handleMessage(client: Client, message: HeartAttackClientMessage) {
    try {
      switch (message.type) {
        case "SET_READY":
          this.controller.setReady(client.sessionId, message.actionId, message.ready);
          break;
        case "START_GAME":
          this.controller.startGame(message.actionId);
          break;
        case "ADD_BOT":
          this.controller.addBot(message.actionId, message.difficulty);
          break;
        case "REMOVE_BOT":
          this.controller.removeBot(message.actionId, message.botId);
          break;
        case "SLAP":
          this.controller.slap(client.sessionId, message.actionId);
          break;
        case "PLAY_AGAIN":
          this.unlock();
          this.controller.playAgain(message.actionId);
          break;
        case "CLOSE_ROOM":
          this.closeRoom();
          break;
      }
    } catch (error) {
      client.send("heart-attack:event", reject(message.actionId, error));
    }
  }

  private closeRoom() {
    if (this.closingRoom) return;
    this.closingRoom = true;
    this.lock();
    this.broadcast("heart-attack:event", { type: "ROOM_CLOSED", reason: "left" });
    this.disconnect();
  }
}

function reject(actionId: string | undefined, error: unknown): HeartAttackServerEvent {
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
  return Math.max(3, Math.min(8, Math.floor(value)));
}

function sanitizeNickname(value: string) {
  const trimmed = value.trim();
  return trimmed.slice(0, 16) || "玩家";
}

function sanitizeClientId(value: string | undefined) {
  const sanitized = value?.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
  return sanitized || undefined;
}
