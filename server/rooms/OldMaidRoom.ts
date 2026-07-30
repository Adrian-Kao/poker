import { Client, Room } from "colyseus";
import {
  applyOldMaidAction,
  createOldMaidOpeningSetup,
  type OldMaidCard,
  type OldMaidDrawAction,
  type OldMaidRemovedPair,
  type OldMaidState
} from "../../lib/games/old-maid";
import type { OldMaidClientMessage, OldMaidServerEvent } from "../messages/oldMaidMessages";
import {
  OldMaidRoomStateSchema,
  syncOldMaidPublicState,
  type LobbyOldMaidPlayer,
  type OldMaidRoomPhase
} from "../schema/OldMaidRoomState";
import { DefaultRoomScheduler, type RoomScheduler, type ScheduledTask } from "../utilities/scheduler";

export const OLD_MAID_TURN_DURATION_MS = 30000;
export const OLD_MAID_RECONNECT_WINDOW_SECONDS = 30;
export const OLD_MAID_SHUFFLE_DURATION_MS = 1600;
export const OLD_MAID_DEAL_CARD_INTERVAL_MS = 80;
export const OLD_MAID_DEAL_DURATION_MS = 54 * OLD_MAID_DEAL_CARD_INTERVAL_MS;
export const OLD_MAID_REVEAL_DURATION_MS = 1000;
export const OLD_MAID_PAIR_INTERVAL_MS = 500;
export const OLD_MAID_READY_DURATION_MS = 1500;

type OldMaidRoomControllerOptions = {
  roomCode?: string;
  maxPlayers?: number;
  scheduler?: RoomScheduler;
  random?: () => number;
  emit?: (event: OldMaidServerEvent, playerId?: string) => void;
  onGameStarted?: () => void;
};

export class OldMaidRoomController {
  readonly publicState = new OldMaidRoomStateSchema();
  readonly scheduler: RoomScheduler;
  private readonly random: () => number;
  private readonly emit: (event: OldMaidServerEvent, playerId?: string) => void;
  private readonly onGameStarted: () => void;
  private lobbyPlayers: LobbyOldMaidPlayer[] = [];
  private gameState: OldMaidState | null = null;
  private actionIds = new Set<string>();
  private presentationPhase: OldMaidRoomPhase = "waiting";
  private phaseStartedAt = 0;
  private phaseDeadline = 0;
  private openingHands: Record<string, OldMaidCard[]> | null = null;
  private openingPairsByPlayer: Record<string, OldMaidRemovedPair[]> = {};
  private openingPairRound = 0;
  private openingTask: ScheduledTask | null = null;
  private openingToken = 0;
  private turnTask: ScheduledTask | null = null;
  private turnToken = 0;
  private finishedEventSent = false;

  constructor(options: OldMaidRoomControllerOptions = {}) {
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

  get hasConnectedPlayers() {
    return this.lobbyPlayers.some((player) => player.connected);
  }

  addHuman(sessionId: string, nickname: string) {
    if (this.gameState) throw new Error("Game already started.");
    if (this.lobbyPlayers.length >= this.publicState.maxPlayers) throw new Error("Room is full.");
    if (this.lobbyPlayers.some((player) => player.sessionId === sessionId)) return;

    this.lobbyPlayers.push({
      id: `player-${sessionId}`,
      nickname: sanitizeNickname(nickname),
      seat: this.lobbyPlayers.length,
      sessionId,
      connected: true,
      ready: false,
      host: this.lobbyPlayers.length === 0
    });
    this.syncPublic();
  }

  markDisconnected(sessionId: string) {
    const player = this.lobbyPlayers.find((item) => item.sessionId === sessionId);
    if (!player) return;
    player.connected = false;
    if (!this.gameState) player.ready = false;
    this.syncPublic();
  }

  markReconnected(sessionId: string) {
    const player = this.lobbyPlayers.find((item) => item.sessionId === sessionId);
    if (!player) throw new Error("Unknown player.");
    player.connected = true;
    this.syncPublic();
    this.sendHand(player.id);
    if (this.gameState?.currentPlayerId === player.id) this.sendDrawOptions();
  }

  expireDisconnectedPlayer(sessionId: string) {
    const player = this.lobbyPlayers.find((item) => item.sessionId === sessionId);
    if (!player || player.connected) return;

    if (!this.gameState) {
      this.lobbyPlayers = this.lobbyPlayers
        .filter((item) => item.sessionId !== sessionId)
        .map((item, seat) => ({ ...item, seat }));
    }
    this.promoteHostIfNeeded();
    this.syncPublic();
  }

  setReady(sessionId: string, actionId: string, ready: boolean) {
    this.requireFreshAction(actionId);
    if (this.gameState) throw new Error("Game already started.");
    const player = this.requireHuman(sessionId);
    player.ready = Boolean(ready);
    this.syncPublic();
  }

  startGame(sessionId: string, actionId: string) {
    this.requireFreshAction(actionId);
    this.requireHost(sessionId);
    if (this.gameState) throw new Error("Game already started.");
    if (this.lobbyPlayers.length < 3) throw new Error("Old Maid needs at least 3 players.");
    if (!this.lobbyPlayers.every((player) => player.connected && player.ready)) {
      throw new Error("All joined players must be connected and ready.");
    }

    const setup = createOldMaidOpeningSetup({
      players: this.lobbyPlayers.map((player) => ({
        id: player.id,
        nickname: player.nickname
      })),
      random: this.random
    });
    this.gameState = setup.state;
    this.openingHands = cloneHands(setup.dealtHands);
    this.openingPairsByPlayer = setup.pairsByPlayer;
    this.openingPairRound = 0;
    this.finishedEventSent = false;
    this.onGameStarted();
    this.emit({ type: "GAME_STARTED" });
    this.startOpeningPhase(
      "shuffling",
      OLD_MAID_SHUFFLE_DURATION_MS,
      () => this.startDealing()
    );
  }

  drawCard(sessionId: string, actionId: string, turnNumber: number, cardSlotId: string) {
    this.requireFreshAction(actionId);
    if (!this.gameState) throw new Error("Game is not started.");
    if (this.presentationPhase !== "playing") {
      throw new Error("Cards cannot be drawn during the opening sequence.");
    }
    const player = this.requireHuman(sessionId);
    const targetPlayerId = this.gameState.targetPlayerId;
    if (!targetPlayerId) throw new Error("Draw target is missing.");

    this.applyAction({
      type: "DRAW_CARD",
      playerId: player.id,
      targetPlayerId,
      turnNumber,
      cardSlotId
    });
  }

  playAgain(sessionId: string, actionId: string) {
    this.requireFreshAction(actionId);
    this.requireHost(sessionId);
    if (this.gameState?.phase !== "finished") throw new Error("Game is not finished.");

    this.cancelOpening();
    this.cancelTurn();
    this.gameState = null;
    this.presentationPhase = "waiting";
    this.phaseStartedAt = 0;
    this.phaseDeadline = 0;
    this.finishedEventSent = false;
    this.publicState.round += 1;
    this.publicState.turnDeadline = 0;
    this.lobbyPlayers = this.lobbyPlayers
      .filter((player) => player.connected)
      .map((player, seat) => ({ ...player, seat, ready: false }));
    this.promoteHostIfNeeded();
    this.syncPublic();
  }

  requestClose(sessionId: string, actionId: string) {
    this.requireFreshAction(actionId);
    this.requireHost(sessionId);
    this.cancelOpening();
    this.cancelTurn();
  }

  processDue(token = this.turnToken) {
    if (
      !this.gameState
      || token !== this.turnToken
      || this.gameState.phase !== "playing"
      || this.presentationPhase !== "playing"
    ) return;
    const layout = this.gameState.drawLayout;
    const playerId = this.gameState.currentPlayerId;
    const targetPlayerId = this.gameState.targetPlayerId;
    if (!layout || !playerId || !targetPlayerId || layout.slots.length === 0) return;

    const slot = layout.slots[Math.floor(this.random() * layout.slots.length)];
    const action: OldMaidDrawAction = {
      type: "DRAW_CARD",
      playerId,
      targetPlayerId,
      turnNumber: this.gameState.turnNumber,
      cardSlotId: slot.cardSlotId,
      system: true
    };
    this.applyAction(action);
  }

  dispose() {
    this.cancelOpening();
    this.cancelTurn();
  }

  private applyAction(action: OldMaidDrawAction) {
    if (!this.gameState) return;
    const before = this.gameState;
    this.gameState = applyOldMaidAction(this.gameState, action, this.random);
    const result = this.gameState.lastAction;

    if (result) {
      this.emit({
        type: "CARD_DRAWN",
        playerId: result.playerId,
        targetPlayerId: result.targetPlayerId,
        system: result.system
      });
      if (result.removedPairs.length > 0) {
        this.emit({
          type: "PAIRS_REMOVED",
          playerId: result.playerId,
          ranks: result.removedPairs.map((pair) => pair.rank)
        });
      }
    }

    this.emitSafePlayers(before);
    this.startTurn();
  }

  private startDealing() {
    this.startOpeningPhase(
      "dealing",
      OLD_MAID_DEAL_DURATION_MS,
      () => this.startRevealing()
    );
  }

  private startRevealing() {
    this.startOpeningPhase(
      "revealing",
      OLD_MAID_REVEAL_DURATION_MS,
      () => this.startOrganizing()
    );
    this.sendHands();
  }

  private startOrganizing() {
    this.openingPairRound = 0;
    this.startOpeningPhase(
      "organizing",
      OLD_MAID_PAIR_INTERVAL_MS,
      () => this.removeOpeningPairRound()
    );
  }

  private removeOpeningPairRound() {
    if (!this.gameState || !this.openingHands) return;

    const removedThisRound: Array<{ playerId: string; pair: OldMaidRemovedPair }> = [];
    this.gameState.players.forEach((player) => {
      const pair = this.openingPairsByPlayer[player.id]?.[this.openingPairRound];
      if (!pair) return;
      const removedIds = new Set(pair.cards.map((card) => card.id));
      this.openingHands![player.id] = (this.openingHands![player.id] ?? [])
        .filter((card) => !removedIds.has(card.id));
      removedThisRound.push({ playerId: player.id, pair });
    });

    this.syncPublic();
    removedThisRound.forEach(({ playerId, pair }) => {
      this.emit({ type: "PAIRS_REMOVED", playerId, ranks: [pair.rank] });
      this.sendHand(playerId);
    });

    this.openingPairRound += 1;
    const pairRounds = Math.max(
      0,
      ...Object.values(this.openingPairsByPlayer).map((pairs) => pairs.length)
    );
    if (this.openingPairRound < pairRounds) {
      this.startOpeningPhase(
        "organizing",
        OLD_MAID_PAIR_INTERVAL_MS,
        () => this.removeOpeningPairRound()
      );
      return;
    }

    this.startReady();
  }

  private startReady() {
    if (!this.gameState) return;
    this.openingHands = cloneHands(this.gameState.hands);
    this.startOpeningPhase(
      "ready",
      OLD_MAID_READY_DURATION_MS,
      () => this.finishOpening()
    );
    this.sendHands();
    this.gameState.finishOrder.forEach((playerId, index) => {
      this.emit({ type: "PLAYER_SAFE", playerId, finishOrder: index + 1 });
    });
  }

  private finishOpening() {
    if (!this.gameState) return;
    this.openingHands = null;
    this.openingPairsByPlayer = {};
    this.openingPairRound = 0;
    this.phaseStartedAt = 0;
    this.phaseDeadline = 0;
    this.presentationPhase = this.gameState.phase;
    this.startTurn();
  }

  private startOpeningPhase(
    phase: Extract<OldMaidRoomPhase, "shuffling" | "dealing" | "revealing" | "organizing" | "ready">,
    durationMs: number,
    onElapsed: () => void
  ) {
    this.scheduler.clear(this.openingTask);
    this.openingTask = null;
    this.openingToken += 1;
    const token = this.openingToken;
    this.presentationPhase = phase;
    this.phaseStartedAt = this.scheduler.now();
    this.phaseDeadline = this.phaseStartedAt + durationMs;
    this.publicState.turnDeadline = 0;
    this.syncPublic();
    this.openingTask = this.scheduler.setTimeout(() => {
      if (token !== this.openingToken) return;
      this.openingTask = null;
      onElapsed();
    }, durationMs);
  }

  private startTurn() {
    this.cancelTurn();
    if (!this.gameState) {
      this.publicState.turnDeadline = 0;
      this.syncPublic();
      return;
    }

    this.presentationPhase = this.gameState.phase;
    if (this.gameState.phase === "finished") {
      this.publicState.turnDeadline = 0;
      this.syncPublic();
      this.sendHands();
      if (!this.finishedEventSent && this.gameState.loserId) {
        this.finishedEventSent = true;
        this.emit({ type: "GAME_FINISHED", loserId: this.gameState.loserId });
      }
      return;
    }

    this.turnToken += 1;
    const token = this.turnToken;
    this.publicState.turnDeadline = this.scheduler.now() + OLD_MAID_TURN_DURATION_MS;
    this.syncPublic();
    this.sendHands();
    this.sendDrawOptions();
    this.emit({
      type: "TURN_CHANGED",
      playerId: this.gameState.currentPlayerId ?? "",
      targetPlayerId: this.gameState.targetPlayerId ?? "",
      turnNumber: this.gameState.turnNumber,
      deadline: this.publicState.turnDeadline
    });
    this.turnTask = this.scheduler.setTimeout(() => this.processDue(token), OLD_MAID_TURN_DURATION_MS);
  }

  private sendHands() {
    this.lobbyPlayers
      .filter((player) => player.connected)
      .forEach((player) => this.sendHand(player.id));
  }

  private sendHand(playerId: string) {
    if (!this.gameState) return;
    const isOpening = [
      "revealing",
      "organizing",
      "ready"
    ].includes(this.presentationPhase);
    if (
      ["shuffling", "dealing"].includes(this.presentationPhase)
      || (isOpening && !this.openingHands)
    ) return;

    this.emit({
      type: "HAND_UPDATED",
      turnNumber: isOpening ? 0 : this.gameState.turnNumber,
      cards: isOpening
        ? this.openingHands?.[playerId] ?? []
        : this.gameState.hands[playerId] ?? []
    }, playerId);
  }

  private sendDrawOptions() {
    const state = this.gameState;
    if (!state || state.phase !== "playing" || !state.currentPlayerId || !state.drawLayout) return;
    this.emit({
      type: "DRAW_OPTIONS_UPDATED",
      turnNumber: state.turnNumber,
      targetPlayerId: state.drawLayout.targetPlayerId,
      cardSlotIds: state.drawLayout.slots.map((slot) => slot.cardSlotId)
    }, state.currentPlayerId);
  }

  private emitSafePlayers(before: OldMaidState) {
    const state = this.gameState;
    if (!state) return;
    state.players.forEach((player) => {
      const previous = before.players.find((item) => item.id === player.id);
      if (previous?.status === "playing" && player.status === "safe") {
        this.emit({
          type: "PLAYER_SAFE",
          playerId: player.id,
          finishOrder: state.finishOrder.indexOf(player.id) + 1
        });
      }
    });
  }

  private syncPublic() {
    const openingHands = [
      "revealing",
      "organizing",
      "ready"
    ].includes(this.presentationPhase)
      ? this.openingHands ?? undefined
      : undefined;
    syncOldMaidPublicState(
      this.publicState,
      this.gameState,
      this.lobbyPlayers,
      this.publicState.turnDeadline,
      {
        phase: this.presentationPhase,
        phaseStartedAt: this.phaseStartedAt,
        phaseDeadline: this.phaseDeadline,
        hands: openingHands
      }
    );
  }

  private cancelOpening() {
    this.scheduler.clear(this.openingTask);
    this.openingTask = null;
    this.openingToken += 1;
    this.openingHands = null;
    this.openingPairsByPlayer = {};
    this.openingPairRound = 0;
  }

  private cancelTurn() {
    this.scheduler.clear(this.turnTask);
    this.turnTask = null;
  }

  private requireFreshAction(actionId: string) {
    if (typeof actionId !== "string" || !actionId.trim()) throw new Error("Missing actionId.");
    if (this.actionIds.has(actionId)) throw new Error("Duplicate actionId.");
    this.actionIds.add(actionId);
  }

  private requireHuman(sessionId: string) {
    const player = this.lobbyPlayers.find((item) => item.sessionId === sessionId);
    if (!player) throw new Error("Unknown player.");
    if (!player.connected) throw new Error("Player is disconnected.");
    return player;
  }

  private requireHost(sessionId: string) {
    const player = this.requireHuman(sessionId);
    if (!player.host) throw new Error("Only the host can do this.");
    return player;
  }

  private promoteHostIfNeeded() {
    if (this.lobbyPlayers.some((player) => player.host && player.connected)) return;
    const nextHost = this.lobbyPlayers.find((player) => player.connected);
    this.lobbyPlayers = this.lobbyPlayers.map((player) => ({
      ...player,
      host: player.id === nextHost?.id
    }));
  }
}

export class OldMaidRoom extends Room {
  private controller!: OldMaidRoomController;
  private closingRoom = false;

  onCreate(options: { maxPlayers?: number } = {}) {
    this.controller = new OldMaidRoomController({
      maxPlayers: options.maxPlayers,
      emit: (event, playerId) => this.emitEvent(event, playerId),
      onGameStarted: () => this.lock()
    });
    const roomCode = this.controller.publicState.roomCode;
    this.setMetadata({ roomCode });
    const listing = (this as unknown as { listing?: Record<string, unknown> }).listing;
    if (listing) listing.roomCode = roomCode;
    this.setState(this.controller.publicState);

    this.onMessage("SET_READY", (client, message: OldMaidClientMessage) => this.handleMessage(client, message));
    this.onMessage("START_GAME", (client, message: OldMaidClientMessage) => this.handleMessage(client, message));
    this.onMessage("DRAW_CARD", (client, message: OldMaidClientMessage) => this.handleMessage(client, message));
    this.onMessage("PLAY_AGAIN", (client, message: OldMaidClientMessage) => this.handleMessage(client, message));
    this.onMessage("CLOSE_ROOM", (client, message: OldMaidClientMessage) => this.handleMessage(client, message));
  }

  onJoin(client: Client, options: { nickname?: string } = {}) {
    try {
      this.controller.addHuman(client.sessionId, options.nickname ?? "玩家");
    } catch (error) {
      client.send("old-maid:event", reject(undefined, error));
      client.leave();
    }
  }

  async onLeave(client: Client, consented?: boolean) {
    this.controller.markDisconnected(client.sessionId);
    if (this.closingRoom) return;
    if (!this.controller.hasConnectedPlayers) {
      this.closeRoom("left");
      return;
    }

    if (!consented) {
      try {
        await this.allowReconnection(client, OLD_MAID_RECONNECT_WINDOW_SECONDS);
        this.controller.markReconnected(client.sessionId);
        return;
      } catch {
        // Reconnection expired; apply the permanent disconnect policy below.
      }
    }

    this.controller.expireDisconnectedPlayer(client.sessionId);
    if (!this.controller.hasConnectedPlayers) this.closeRoom("left");
  }

  onDispose() {
    this.controller.dispose();
  }

  private handleMessage(client: Client, message: OldMaidClientMessage) {
    try {
      switch (message.type) {
        case "SET_READY":
          this.controller.setReady(client.sessionId, message.actionId, message.ready);
          break;
        case "START_GAME":
          this.controller.startGame(client.sessionId, message.actionId);
          break;
        case "DRAW_CARD":
          this.controller.drawCard(
            client.sessionId,
            message.actionId,
            message.turnNumber,
            message.cardSlotId
          );
          break;
        case "PLAY_AGAIN":
          this.controller.playAgain(client.sessionId, message.actionId);
          this.unlock();
          break;
        case "CLOSE_ROOM":
          this.controller.requestClose(client.sessionId, message.actionId);
          this.closeRoom("cancelled");
          break;
      }
    } catch (error) {
      client.send("old-maid:event", reject(message.actionId, error));
    }
  }

  private emitEvent(event: OldMaidServerEvent, playerId?: string) {
    if (!playerId) {
      this.broadcast("old-maid:event", event);
      return;
    }

    const client = this.clients.find((item) => `player-${item.sessionId}` === playerId);
    client?.send("old-maid:event", event);
  }

  private closeRoom(reason: "left" | "cancelled") {
    if (this.closingRoom) return;
    this.closingRoom = true;
    this.controller.dispose();
    this.lock();
    this.broadcast("old-maid:event", { type: "ROOM_CLOSED", reason });
    this.disconnect();
  }
}

function reject(actionId: string | undefined, error: unknown): OldMaidServerEvent {
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

function cloneHands(hands: Readonly<Record<string, readonly OldMaidCard[]>>) {
  return Object.fromEntries(
    Object.entries(hands).map(([playerId, cards]) => [playerId, [...cards]])
  );
}

function sanitizeNickname(value: string) {
  const trimmed = value.trim();
  return trimmed.slice(0, 12) || "玩家";
}
