import { Client, Room } from "colyseus";
import {
  applySevensAction,
  calculateBotMove,
  createSevensGame,
  getSevensBotDelayMs,
  type SevensBotDifficulty,
  type SevensMode,
  type SevensState
} from "../../lib/games/sevens";
import { getBotPlayerNameForDifficulty } from "../../lib/games/core/botNames";
import type { SevensClientMessage, SevensServerEvent } from "../messages/sevensMessages";
import { SevensRoomStateSchema, syncSevensPublicState, type LobbySevensPlayer } from "../schema/SevensRoomState";
import { DefaultRoomScheduler, type RoomScheduler, type ScheduledTask } from "../utilities/scheduler";

type ControllerOptions = {
  roomCode?: string;
  mode?: SevensMode;
  maxPlayers?: number;
  bots?: number;
  difficulty?: SevensBotDifficulty;
  random?: () => number;
  scheduler?: RoomScheduler;
  emit?: (event: SevensServerEvent, playerId?: string) => void;
  onStart?: () => void;
};

export class SevensRoomController {
  readonly publicState = new SevensRoomStateSchema();
  private lobby: LobbySevensPlayer[] = [];
  private game: SevensState | null = null;
  private botCounter = 1;
  private botTask: ScheduledTask | null = null;
  private readonly processedActions = new Set<string>();

  constructor(private options: ControllerOptions = {}) {
    this.publicState.roomCode = options.roomCode ?? createRoomCode(options.random ?? Math.random);
    this.publicState.mode = parseMode(options.mode);
    this.publicState.maxPlayers = normalizePlayerCount(this.publicState.mode as SevensMode, options.maxPlayers);
    this.sync();
  }

  get state() { return this.game; }
  private get scheduler() { return this.options.scheduler ?? (this.options.scheduler = new DefaultRoomScheduler()); }
  private get emit() { return this.options.emit ?? (() => undefined); }
  private get random() { return this.options.random ?? Math.random; }

  addHuman(sessionId: string, nickname: string, clientId?: string) {
    if (this.game) throw new Error("ROOM_LOCKED");
    const existing = this.lobby.find((player) => player.sessionId === sessionId || (clientId && player.clientId === clientId));
    if (existing) {
      existing.id = `player-${sessionId}`;
      existing.sessionId = sessionId;
      existing.clientId = clientId ?? existing.clientId;
      existing.nickname = sanitizeNickname(nickname);
      existing.connected = true;
      this.sync();
      return;
    }
    if (this.lobby.length >= this.publicState.maxPlayers) throw new Error("ROOM_FULL");
    this.lobby.push({
      id: `player-${sessionId}`,
      nickname: sanitizeNickname(nickname),
      seat: this.lobby.length,
      type: "human",
      sessionId,
      clientId,
      connected: true,
      ready: false,
      host: !this.lobby.some((player) => player.type === "human")
    });
    let bots = Math.max(0, Math.floor(this.options.bots ?? 0));
    while (bots > 0 && this.lobby.length < this.publicState.maxPlayers) {
      this.addBotInternal(this.options.difficulty ?? "normal");
      bots -= 1;
    }
    this.options.bots = 0;
    this.sync();
  }

  setReady(sessionId: string, actionId: string, ready: boolean) {
    this.fresh(actionId);
    if (this.game) throw new Error("ROOM_LOCKED");
    this.requireHuman(sessionId).ready = ready;
    this.sync();
  }

  setSettings(sessionId: string, actionId: string, mode: SevensMode, maxPlayers: number) {
    this.fresh(actionId);
    this.requireHost(sessionId);
    if (this.game) throw new Error("ROOM_LOCKED");
    const nextMode = parseMode(mode);
    const nextMax = normalizePlayerCount(nextMode, maxPlayers);
    if (this.lobby.length > nextMax) throw new Error("TOO_MANY_PLAYERS");
    this.publicState.mode = nextMode;
    this.publicState.maxPlayers = nextMax;
    this.lobby.forEach((player) => { if (player.type === "human") player.ready = false; });
    this.sync();
  }

  addBot(sessionId: string, actionId: string, difficulty: SevensBotDifficulty) {
    this.fresh(actionId);
    this.requireHost(sessionId);
    if (this.game) throw new Error("ROOM_LOCKED");
    if (this.lobby.length >= this.publicState.maxPlayers) throw new Error("ROOM_FULL");
    this.addBotInternal(difficulty);
    this.sync();
  }

  removeBot(sessionId: string, actionId: string, botId: string) {
    this.fresh(actionId);
    this.requireHost(sessionId);
    if (this.game) throw new Error("ROOM_LOCKED");
    this.lobby = this.lobby
      .filter((player) => player.type !== "bot" || player.id !== botId)
      .map((player, seat) => ({ ...player, seat }));
    this.sync();
  }

  start(sessionId: string, actionId: string) {
    this.fresh(actionId);
    this.requireHost(sessionId);
    if (this.lobby.length !== this.publicState.maxPlayers) throw new Error("ALL_SEATS_REQUIRED");
    if (!this.lobby.every((player) => player.type === "bot" || (player.connected && player.ready))) {
      throw new Error("ALL_PLAYERS_MUST_BE_READY");
    }
    this.game = createSevensGame({
      mode: this.publicState.mode as SevensMode,
      players: this.lobby.map((player) => ({
        id: player.id,
        nickname: player.nickname,
        type: player.type,
        botDifficulty: player.botDifficulty
      })),
      random: this.random
    });
    this.options.onStart?.();
    this.emit({ type: "GAME_STARTED" });
    this.afterAction();
  }

  play(sessionId: string, actionId: string, cardId: string) {
    this.fresh(actionId);
    const player = this.requireHuman(sessionId);
    this.apply(player.id, "PLAY_CARD", cardId);
  }

  cover(sessionId: string, actionId: string, cardId: string) {
    this.fresh(actionId);
    const player = this.requireHuman(sessionId);
    this.apply(player.id, "COVER_CARD", cardId);
  }

  requestHand(sessionId: string) { this.sendHand(this.requireHuman(sessionId).id); }

  reset(sessionId: string, actionId: string) {
    this.fresh(actionId);
    this.requireHost(sessionId);
    this.cancel();
    this.game = null;
    this.publicState.round += 1;
    this.lobby = this.lobby
      .filter((player) => player.type === "bot" || player.connected)
      .map((player, seat) => ({ ...player, seat, ready: player.type === "bot" }));
    this.sync();
  }

  disconnect(sessionId: string) {
    const player = this.lobby.find((item) => item.sessionId === sessionId);
    if (player) {
      player.connected = false;
      if (!this.game) player.ready = false;
    }
    this.promoteHost();
    this.sync();
  }

  reconnect(sessionId: string) {
    const player = this.lobby.find((item) => item.sessionId === sessionId);
    if (player) player.connected = true;
    this.sync();
    if (player) this.sendHand(player.id);
  }

  dispose() { this.cancel(); }

  private apply(playerId: string, type: "PLAY_CARD" | "COVER_CARD", cardId: string) {
    if (!cardId || typeof cardId !== "string") throw new Error("INVALID_CARD");
    const before = this.requireGame();
    this.game = applySevensAction(before, { type, playerId, cardId, timestamp: this.scheduler.now() });
    const action = this.game.lastAction;
    if (type === "PLAY_CARD" && action) this.emit({ type: "CARD_PLAYED", playerId, card: action.card });
    if (type === "COVER_CARD" && action) this.emit({ type: "CARD_COVERED", playerId, card: action.card });
    this.afterAction();
  }

  private afterAction() {
    this.cancel();
    this.sync();
    this.sendHands();
    if (!this.game) return;
    if (this.game.phase === "finished") {
      this.emit({
        type: "GAME_FINISHED",
        winnerId: this.game.winnerId ?? "",
        standings: this.game.standings ?? []
      });
      return;
    }
    this.emit({ type: "TURN_CHANGED", playerId: this.game.currentPlayerId ?? "" });
    const current = this.lobby.find((player) => player.id === this.game?.currentPlayerId);
    if (current?.type !== "bot") return;
    this.botTask = this.scheduler.setTimeout(() => {
      if (!this.game || this.game.currentPlayerId !== current.id) return;
      const move = calculateBotMove(this.game, current.id, current.botDifficulty ?? "normal", this.random);
      if (!move) throw new Error("BOT_HAS_NO_LEGAL_ACTION");
      this.game = applySevensAction(this.game, {
        ...move,
        playerId: current.id,
        timestamp: this.scheduler.now()
      });
      const action = this.game.lastAction;
      if (move.type === "PLAY_CARD" && action) this.emit({ type: "CARD_PLAYED", playerId: current.id, card: action.card });
      if (move.type === "COVER_CARD" && action) this.emit({ type: "CARD_COVERED", playerId: current.id, card: action.card });
      this.afterAction();
    }, getSevensBotDelayMs(this.random));
  }

  private sendHands() { this.lobby.filter((player) => player.type === "human").forEach((player) => this.sendHand(player.id)); }
  private sendHand(playerId: string) { if (this.game) this.emit({ type: "PRIVATE_HAND", cards: this.game.hands[playerId] ?? [] }, playerId); }
  private sync() { syncSevensPublicState(this.publicState, this.game, this.lobby); }
  private fresh(actionId: string) { if (!actionId || this.processedActions.has(actionId)) throw new Error("ACTION_ALREADY_PROCESSED"); this.processedActions.add(actionId); }
  private requireGame() { if (!this.game) throw new Error("GAME_NOT_STARTED"); return this.game; }
  private requireHuman(sessionId: string) { const player = this.lobby.find((item) => item.sessionId === sessionId && item.type === "human"); if (!player) throw new Error("UNKNOWN_PLAYER"); return player; }
  private requireHost(sessionId: string) { const player = this.requireHuman(sessionId); if (!player.host) throw new Error("HOST_ONLY"); return player; }
  private addBotInternal(difficulty: SevensBotDifficulty) { const number = this.botCounter++; this.lobby.push({ id: `bot-${number}`, nickname: getBotPlayerNameForDifficulty(number, difficulty, this.random, this.lobby.map((player) => player.nickname)), seat: this.lobby.length, type: "bot", botDifficulty: difficulty, connected: true, ready: true, host: false }); }
  private promoteHost() { if (this.lobby.some((player) => player.host && player.connected)) return; const next = this.lobby.find((player) => player.type === "human" && player.connected); this.lobby = this.lobby.map((player) => ({ ...player, host: player.id === next?.id })); }
  private cancel() { this.scheduler.clear(this.botTask); this.botTask = null; }
}

export class SevensRoom extends Room {
  private controller!: SevensRoomController;
  private closing = false;

  onCreate(options: { mode?: SevensMode; maxPlayers?: number; bots?: number; difficulty?: SevensBotDifficulty } = {}) {
    this.controller = new SevensRoomController({
      ...options,
      emit: (event, playerId) => this.emitEvent(event, playerId),
      onStart: () => this.lock()
    });
    const roomCode = this.controller.publicState.roomCode;
    this.setMetadata({ roomCode });
    const listing = (this as unknown as { listing?: Record<string, unknown> }).listing;
    if (listing) listing.roomCode = roomCode;
    this.setState(this.controller.publicState);
    for (const type of ["SET_READY", "SET_SETTINGS", "START_GAME", "ADD_BOT", "REMOVE_BOT", "PLAY_CARD", "COVER_CARD", "REQUEST_STATE", "PLAY_AGAIN", "CLOSE_ROOM"]) {
      this.onMessage(type, (client, message: SevensClientMessage) => this.handle(client, message));
    }
  }

  onJoin(client: Client, options: { nickname?: string; clientId?: string } = {}) {
    try {
      this.controller.addHuman(client.sessionId, options.nickname ?? "玩家", sanitizeClientId(options.clientId));
    } catch (error) {
      client.send("sevens:event", reject(undefined, error));
      client.leave();
    }
  }

  async onLeave(client: Client, consented?: boolean) {
    this.controller.disconnect(client.sessionId);
    if (this.closing || consented) return;
    try {
      await this.allowReconnection(client, 30);
      this.controller.reconnect(client.sessionId);
    } catch {
      this.controller.disconnect(client.sessionId);
    }
  }

  onDispose() { this.controller.dispose(); }

  private handle(client: Client, message: SevensClientMessage) {
    try {
      switch (message.type) {
        case "SET_READY": this.controller.setReady(client.sessionId, message.actionId, message.ready); break;
        case "SET_SETTINGS": this.controller.setSettings(client.sessionId, message.actionId, message.mode, message.maxPlayers); break;
        case "START_GAME": this.controller.start(client.sessionId, message.actionId); break;
        case "ADD_BOT": this.controller.addBot(client.sessionId, message.actionId, message.difficulty); break;
        case "REMOVE_BOT": this.controller.removeBot(client.sessionId, message.actionId, message.botId); break;
        case "PLAY_CARD": this.controller.play(client.sessionId, message.actionId, message.cardId); break;
        case "COVER_CARD": this.controller.cover(client.sessionId, message.actionId, message.cardId); break;
        case "REQUEST_STATE": this.controller.requestHand(client.sessionId); break;
        case "PLAY_AGAIN": this.unlock(); this.controller.reset(client.sessionId, message.actionId); break;
        case "CLOSE_ROOM": this.closeRoom(); break;
      }
    } catch (error) {
      client.send("sevens:event", reject(message.actionId, error));
    }
  }

  private emitEvent(event: SevensServerEvent, playerId?: string) {
    if (!playerId) { this.broadcast("sevens:event", event); return; }
    this.clients.find((client) => `player-${client.sessionId}` === playerId)?.send("sevens:event", event);
  }

  private closeRoom() {
    if (this.closing) return;
    this.closing = true;
    this.lock();
    this.broadcast("sevens:event", { type: "ROOM_CLOSED", reason: "cancelled" });
    this.disconnect();
  }
}

function reject(actionId: string | undefined, error: unknown): SevensServerEvent { return { type: "ACTION_REJECTED", actionId, reason: error instanceof Error ? error.message : "ACTION_REJECTED" }; }
function createRoomCode(random: () => number) { return String(Math.floor(100000 + random() * 900000)); }
function sanitizeNickname(value: string) { return value.trim().slice(0, 16) || "玩家"; }
function sanitizeClientId(value?: string) { return value?.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || undefined; }
function parseMode(value?: SevensMode): SevensMode { return value === "double-deck-race" ? value : "classic-four"; }
function normalizePlayerCount(mode: SevensMode, value?: number) { if (mode === "classic-four") return 4; return Math.max(5, Math.min(8, Math.floor(value ?? 5))); }
