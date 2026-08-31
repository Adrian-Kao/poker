"use client";

import "./page.css";
import {
  CheckCircle2,
  Clock3,
  Crown,
  Ghost
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Client, type Room } from "colyseus.js";
import type { OldMaidCard } from "../../../lib/games/old-maid";
import type { OldMaidServerEvent } from "../../../server/messages/oldMaidMessages";
import {
  OldMaidRoomStateSchema,
  type PublicOldMaidPlayer
} from "../../../server/schema/OldMaidRoomState";
import { useBgmMode } from "../../SoundProvider";
import {
  RoomHeader,
  RoomOpponentSeat,
  RoomSelfBadge,
  RoomTable,
  UnifiedWaitingRoom,
  type RoomSeatPosition
} from "../room";

type ConnectionStatus = "connecting" | "connected" | "error" | "closed";
type OldMaidPhase =
  | "waiting"
  | "shuffling"
  | "dealing"
  | "revealing"
  | "organizing"
  | "ready"
  | "playing"
  | "finished";
type OldMaidClientMessageType =
  | "SET_READY"
  | "START_GAME"
  | "DRAW_CARD"
  | "PLAY_AGAIN"
  | "CLOSE_ROOM";

const gameServerUrl = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "ws://localhost:2567";
const suitMarks = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠"
} as const;

export default function OldMaidPage() {
  const [roomCode, setRoomCode] = useState("------");
  const [nickname, setNickname] = useState("玩家");
  const [ownPlayerId, setOwnPlayerId] = useState("");
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [statusText, setStatusText] = useState("正在連接抽鬼牌伺服器...");
  const [roomState, setRoomState] = useState<OldMaidRoomStateSchema | null>(null);
  const [stateVersion, setStateVersion] = useState(0);
  const [hand, setHand] = useState<OldMaidCard[]>([]);
  const [removingCardIds, setRemovingCardIds] = useState<string[]>([]);
  const [drawOptions, setDrawOptions] = useState<string[]>([]);
  const [pendingSlotId, setPendingSlotId] = useState("");
  const [notice, setNotice] = useState("等待玩家進入房間");
  const roomRef = useRef<Room<OldMaidRoomStateSchema> | null>(null);
  const handRef = useRef<OldMaidCard[]>([]);
  const handUpdateTaskRef = useRef<number | null>(null);

  useEffect(() => {
    let disposed = false;
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode") === "join" ? "join" : "create";
    const requestedRoom = (params.get("room") ?? "").replace(/\D/g, "").slice(0, 6);
    const name = params.get("name")?.trim()
      || params.get("nickname")?.trim()
      || "玩家";
    const maxPlayers = Number(params.get("players") ?? 4);
    const clientId = getTabClientId("old-maid");
    const client = new Client(gameServerUrl);

    setNickname(name);

    async function connect() {
      try {
        setStatus("connecting");
        setStatusText(
          mode === "join"
            ? `正在加入房間 ${requestedRoom}...`
            : "正在建立抽鬼牌私人房間..."
        );

        const room =
          mode === "join"
            ? await client.join<OldMaidRoomStateSchema>(
                "old_maid",
                { nickname: name, roomCode: requestedRoom, clientId },
                OldMaidRoomStateSchema
              )
            : await client.create<OldMaidRoomStateSchema>(
                "old_maid",
                { nickname: name, maxPlayers, clientId },
                OldMaidRoomStateSchema
              );

        if (disposed) {
          await room.leave();
          return;
        }

        const ownId = `player-${room.sessionId}`;
        roomRef.current = room;
        setOwnPlayerId(ownId);
        setStatus("connected");
        setStatusText(
          mode === "join"
            ? "已加入抽鬼牌等待室，等待房主開始遊戲。"
            : "抽鬼牌房間已建立，分享房號邀請朋友。"
        );
        setRoomState(room.state);
        setRoomCode(room.state.roomCode || room.roomId.slice(0, 6));
        setStateVersion((version) => version + 1);

        room.onStateChange((state) => {
          setRoomState(state);
          setRoomCode(state.roomCode || room.roomId.slice(0, 6));
          setStateVersion((version) => version + 1);
          if (state.currentPlayerId !== ownId) setDrawOptions([]);
          if (state.phase === "waiting") {
            if (handUpdateTaskRef.current !== null) {
              window.clearTimeout(handUpdateTaskRef.current);
              handUpdateTaskRef.current = null;
            }
            handRef.current = [];
            setHand([]);
            setRemovingCardIds([]);
            setDrawOptions([]);
            setPendingSlotId("");
          }
        });

        room.onMessage<OldMaidServerEvent>("old-maid:event", (event) => {
          const players = Array.from(room.state.players);

          switch (event.type) {
            case "GAME_STARTED":
              setNotice("牌堆正在洗牌，準備發牌。");
              break;
            case "HAND_UPDATED": {
              const nextHand = [...event.cards];
              const nextIds = new Set(nextHand.map((card) => card.id));
              const removedIds = event.turnNumber === 0
                ? handRef.current
                    .filter((card) => !nextIds.has(card.id))
                    .map((card) => card.id)
                : [];

              if (handUpdateTaskRef.current !== null) {
                window.clearTimeout(handUpdateTaskRef.current);
                handUpdateTaskRef.current = null;
              }
              if (removedIds.length > 0) {
                setRemovingCardIds(removedIds);
                handUpdateTaskRef.current = window.setTimeout(() => {
                  handRef.current = nextHand;
                  setHand(nextHand);
                  setRemovingCardIds([]);
                  handUpdateTaskRef.current = null;
                }, 360);
              } else {
                handRef.current = nextHand;
                setHand(nextHand);
                setRemovingCardIds([]);
              }
              break;
            }
            case "DRAW_OPTIONS_UPDATED":
              setDrawOptions([...event.cardSlotIds]);
              setPendingSlotId("");
              setNotice(`請從 ${playerName(players, event.targetPlayerId)} 的手牌抽一張。`);
              break;
            case "CARD_DRAWN":
              setDrawOptions([]);
              setPendingSlotId("");
              setNotice(
                event.system
                  ? `${playerName(players, event.playerId)} 逾時，由系統代抽一張。`
                  : `${playerName(players, event.playerId)} 已抽取一張牌。`
              );
              break;
            case "PAIRS_REMOVED":
              setNotice(
                `${playerName(players, event.playerId)} 丟出 ${event.ranks.join("、")} 的配對。`
              );
              break;
            case "TURN_CHANGED":
              setPendingSlotId("");
              if (event.playerId !== ownId) setDrawOptions([]);
              setNotice(
                event.playerId === ownId
                  ? `輪到你從 ${playerName(players, event.targetPlayerId)} 抽牌。`
                  : `輪到 ${playerName(players, event.playerId)} 抽牌。`
              );
              break;
            case "PLAYER_SAFE":
              setNotice(`${playerName(players, event.playerId)} 已經安全出局。`);
              break;
            case "GAME_FINISHED":
              setNotice(`${playerName(players, event.loserId)} 留下兩張鬼牌。`);
              break;
            case "ACTION_REJECTED":
              setPendingSlotId("");
              setStatusText(event.reason);
              break;
            case "ROOM_CLOSED":
              window.location.href = "/";
              break;
          }
        });

        room.onLeave((code) => {
          if (!disposed) {
            setStatus("closed");
            setStatusText(`已離開牌局（${code}）`);
          }
        });

        room.onError((_code, message) => {
          setStatus("error");
          setStatusText(message ?? "連線發生錯誤");
        });
      } catch (error) {
        setStatus("error");
        setStatusText(
          error instanceof Error ? error.message : "無法建立或加入抽鬼牌房間"
        );
      }
    }

    connect();

    return () => {
      disposed = true;
      if (handUpdateTaskRef.current !== null) {
        window.clearTimeout(handUpdateTaskRef.current);
      }
      roomRef.current?.leave();
      roomRef.current = null;
    };
  }, []);

  const players = useMemo(
    () => Array.from(roomState?.players ?? []),
    [roomState, stateVersion]
  );
  const phase = (roomState?.phase ?? "waiting") as OldMaidPhase;
  useBgmMode(phase === "waiting" ? "lobby" : "playing");
  const ownPlayer = players.find((player) => player.id === ownPlayerId);
  const isHost = ownPlayer?.host ?? false;
  const isMyTurn = phase === "playing" && roomState?.currentPlayerId === ownPlayerId;
  const isDrawTarget = phase === "playing" && roomState?.targetPlayerId === ownPlayerId;
  const canUseRoom = status === "connected" && !!roomRef.current;
  const canStart =
    canUseRoom
    && isHost
    && phase === "waiting"
    && players.length === (roomState?.maxPlayers ?? 6);
  const opponents = players.filter((player) => player.id !== ownPlayerId);
  const currentPlayer = players.find((player) => player.id === roomState?.currentPlayerId);
  const targetPlayer = players.find((player) => player.id === roomState?.targetPlayerId);
  const countdown = useCountdown(roomState?.turnDeadline ?? 0, stateVersion);
  const isOpening = [
    "shuffling",
    "dealing",
    "revealing",
    "organizing",
    "ready"
  ].includes(phase);
  const phaseProgress = usePhaseProgress(
    roomState?.phaseStartedAt ?? 0,
    roomState?.phaseDeadline ?? 0,
    stateVersion
  );
  const dealtCardCount = phase === "dealing"
    ? Math.min(54, Math.floor(phaseProgress * 54))
    : ["revealing", "organizing", "ready", "playing", "finished"].includes(phase)
      ? 54
      : 0;
  const dealCounts = useMemo(() => {
    const counts = Object.fromEntries(players.map((player) => [player.id, 0]));
    const dealerIndex = players.findIndex(
      (player) => player.id === roomState?.dealerPlayerId
    );
    if (dealerIndex < 0) return counts;
    for (let index = 0; index < dealtCardCount; index += 1) {
      const player = players[(dealerIndex + 1 + index) % players.length];
      counts[player.id] += 1;
    }
    return counts;
  }, [dealtCardCount, players, roomState?.dealerPlayerId]);
  const ownVisibleCardCount = phase === "dealing"
    ? dealCounts[ownPlayerId] ?? 0
    : phase === "shuffling"
      ? 0
      : hand.length;

  function send(
    type: OldMaidClientMessageType,
    extra: Record<string, unknown> = {}
  ) {
    const room = roomRef.current;
    if (!room) return;
    const actionId = `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    room.send(type, { type, actionId, ...extra });
  }

  function drawCard(cardSlotId: string) {
    if (!isMyTurn || pendingSlotId || !roomState) return;
    setPendingSlotId(cardSlotId);
    send("DRAW_CARD", {
      turnNumber: roomState.turnNumber,
      cardSlotId
    });
  }

  function leaveRoom() {
    const room = roomRef.current;
    if (!room) {
      window.location.href = "/";
      return;
    }

    send("CLOSE_ROOM");

    window.setTimeout(() => {
      window.location.href = "/";
    }, 180);
  }

  if (phase === "waiting") {
    return <UnifiedWaitingRoom
      gameName="抽鬼牌"
      roomCode={roomCode}
      round={roomState?.round ?? 1}
      status={status}
      statusText={statusText}
      players={players.map((player) => ({ id: player.id, seat: player.seat, nickname: player.nickname, host: player.host, ready: player.ready, type: "human" }))}
      maxPlayers={roomState?.maxPlayers ?? 6}
      ownId={ownPlayerId}
      isHost={isHost}
      canUseRoom={canUseRoom}
      canStart={canStart}
      realOnly
      minPlayers={3}
      onStart={() => send("START_GAME")}
      onLeave={leaveRoom}
    />;
  }
  return (
    <main className="bluff-page-shell old-maid-shell old-maid-shared-shell">
      <RoomHeader
        docsHref="/docs/games/old-maid.md"
        gameName="抽鬼牌"
        realOnly
        roomCode={roomCode}
        round={roomState?.round ?? 1}
        status={status}
        onLeave={leaveRoom}
      />

      <RoomTable gameName="抽鬼牌" className={`old-maid-shared-table phase-${phase}`}>
        {opponents.map((player, index) => {
          const cardsRemaining = phase === "dealing"
            ? dealCounts[player.id] ?? 0
            : phase === "shuffling"
              ? 0
              : player.cardsRemaining;
          return (
            <RoomOpponentSeat
              active={player.id === roomState?.currentPlayerId}
              key={player.id}
              player={{
                id: player.id,
                nickname: player.nickname,
                connected: player.connected,
                cardsRemaining,
                status: player.status === "playing" ? "playing" : "finished",
                type: "human"
              }}
              position={oldMaidOpponentPositions(opponents.length)[index]}
            />
          );
        })}

        {isOpening ? (
          <OpeningStage
            dealtCardCount={dealtCardCount}
            dealerPlayerId={roomState?.dealerPlayerId ?? ""}
            phase={phase}
            phaseProgress={phaseProgress}
            players={players}
          />
        ) : (
        <section className="old-maid-draw-stage" aria-live="polite">
          <div className="old-maid-turn-line">
            <span>
              第 <strong>{roomState?.turnNumber ?? 0}</strong> 回合
            </span>
            <span className="old-maid-clock">
              <Clock3 size={18} />
              {countdown} 秒
            </span>
          </div>

          <div className="old-maid-turn-title">
            <span className={`old-maid-avatar ${isMyTurn ? "yellow" : "blue"}`}>
              {(currentPlayer?.nickname || "玩").slice(0, 1)}
            </span>
            <div>
              <small>{isMyTurn ? "輪到你" : "目前抽牌者"}</small>
              <strong>{currentPlayer?.nickname || "等待玩家"}</strong>
            </div>
            <span className="old-maid-arrow">→</span>
            <span className="old-maid-avatar pink">
              {(targetPlayer?.nickname || "玩").slice(0, 1)}
            </span>
            <div>
              <small>被抽牌者</small>
              <strong>{targetPlayer?.nickname || "—"}</strong>
            </div>
          </div>

          {isMyTurn && drawOptions.length > 0 ? (
            <>
              <p className="old-maid-stage-hint">
                牌背順序由伺服器固定，點一張抽取。
              </p>
              <div className="old-maid-draw-rack" aria-label={`${targetPlayer?.nickname} 的隱藏手牌`}>
                {drawOptions.map((cardSlotId, index) => (
                  <button
                    aria-label={`抽第 ${index + 1} 張牌`}
                    className={pendingSlotId === cardSlotId ? "pending" : ""}
                    disabled={Boolean(pendingSlotId)}
                    key={cardSlotId}
                    onClick={() => drawCard(cardSlotId)}
                    type="button"
                  >
                    <CardBack index={index} />
                  </button>
                ))}
              </div>
            </>
          ) : isDrawTarget ? (
            <div className="old-maid-target-message">
              <Ghost size={34} />
              <strong>{currentPlayer?.nickname} 正在從你的手牌抽牌</strong>
              <span>下方正面手牌的順序，就是對方看到的牌背順序。</span>
            </div>
          ) : (
            <div className="old-maid-spectator-message">
              <strong>
                {currentPlayer?.nickname} → {targetPlayer?.nickname}
              </strong>
              <span>兩位玩家正在抽牌，請等待這次互動完成。</span>
            </div>
          )}

          <p className="old-maid-notice">{notice}</p>
        </section>
        )}

        <section className="old-maid-self-area" aria-label="自己的手牌">
          <RoomSelfBadge
            active={isMyTurn}
            count={ownVisibleCardCount}
            nickname={nickname}
          />

          {["shuffling", "dealing"].includes(phase) ? (
            <div className="old-maid-deal-progress">
              {phase === "shuffling"
                ? "牌仍在中央洗牌"
                : `已收到 ${ownVisibleCardCount} 張牌，發牌完成後一起亮牌`}
            </div>
          ) : hand.length > 0 ? (
            <div className="old-maid-hand">
              {hand.map((card) => (
                <PlayingCard
                  card={card}
                  key={card.id}
                  removing={removingCardIds.includes(card.id)}
                />
              ))}
            </div>
          ) : (
            <div className="old-maid-safe-note">
              <CheckCircle2 size={28} />
              你已經沒有手牌，安全出局。
            </div>
          )}
        </section>
      </RoomTable>

      {phase === "ready" ? (
        <section
          className="old-maid-ready-overlay"
          role="status"
          style={{ animationDelay: `${-Math.round(phaseProgress * 1500)}ms` }}
        >
          <CheckCircle2 size={38} />
          <strong>整理手牌完畢，遊戲開始</strong>
        </section>
      ) : null}

      {phase === "finished" ? (
        <section className="old-maid-result" role="dialog" aria-modal="true">
          <Crown size={42} />
          <span>本局結束</span>
          <h2>
            {playerName(players, roomState?.loserId ?? "")}
            留下兩張鬼牌
          </h2>
          <p>
            {roomState?.loserId === ownPlayerId
              ? "這次鬼牌留在你手上。"
              : "其他玩家已全部安全出局。"}
          </p>
          {isHost ? (
            <button type="button" onClick={() => send("PLAY_AGAIN")}>
              再來一局
            </button>
          ) : (
            <span>等待房主決定是否再開一局。</span>
          )}
        </section>
      ) : null}

      <div className="sr-only" aria-live="polite">
        {statusText}。{notice}
      </div>
    </main>
  );
}

function OpeningStage({
  dealtCardCount,
  dealerPlayerId,
  phase,
  phaseProgress,
  players
}: {
  dealtCardCount: number;
  dealerPlayerId: string;
  phase: OldMaidPhase;
  phaseProgress: number;
  players: PublicOldMaidPlayer[];
}) {
  const labels: Partial<Record<OldMaidPhase, { eyebrow: string; title: string; detail: string }>> = {
    shuffling: {
      eyebrow: "開局準備",
      title: "洗牌中",
      detail: "54 張牌正在中央洗牌。"
    },
    dealing: {
      eyebrow: `${dealtCardCount}／54`,
      title: "逐張發牌",
      detail: "從莊家後一席開始，每 80 ms 發出一張牌。"
    },
    revealing: {
      eyebrow: "查看手牌",
      title: "所有牌已發完",
      detail: "每位玩家現在只會看見自己的完整正面手牌。"
    },
    organizing: {
      eyebrow: "自動整理",
      title: "正在丟出成對牌",
      detail: "每 0.5 秒，每位玩家同時最多移除一組配對。"
    },
    ready: {
      eyebrow: "準備完成",
      title: "即將進入第一回合",
      detail: "提示淡出後才會啟動 30 秒回合倒數。"
    }
  };
  const label = labels[phase] ?? labels.shuffling!;
  const dealerIndex = players.findIndex((player) => player.id === dealerPlayerId);
  const activePlayerIndex = phase === "dealing" && dealtCardCount < 54 && dealerIndex >= 0
    ? (dealerIndex + 1 + dealtCardCount) % Math.max(1, players.length)
    : -1;

  return (
    <section className={`old-maid-opening-stage phase-${phase}`} aria-live="polite">
      <div className="old-maid-opening-copy">
        <span>{label.eyebrow}</span>
        <strong>{label.title}</strong>
        <small>{label.detail}</small>
      </div>

      {phase === "shuffling" || phase === "dealing" ? (
        <div className="old-maid-opening-board">
          <div className="old-maid-opening-deck" aria-label="中央牌堆">
            <CardBack index={0} />
            <CardBack index={1} />
            <CardBack index={2} />
          </div>
          {phase === "dealing" && dealtCardCount < 54 ? (
            <span
              className={`old-maid-opening-flying target-${activePlayerIndex % 6}`}
              key={dealtCardCount}
            >
              <CardBack index={dealtCardCount} />
            </span>
          ) : null}
        </div>
      ) : (
        <div className="old-maid-opening-status">
          {phase === "revealing" ? "正面亮牌" : phase === "organizing" ? "配對飛出" : "準備開始"}
        </div>
      )}

      <span className="old-maid-opening-progress" aria-hidden="true">
        <i style={{ width: `${Math.round(phaseProgress * 100)}%` }} />
      </span>
    </section>
  );
}

function PlayingCard({
  card,
  removing = false
}: {
  card: OldMaidCard;
  removing?: boolean;
}) {
  const joker = card.rank === "JOKER";
  const red = card.suit === "diamonds" || card.suit === "hearts";
  const mark = card.suit ? suitMarks[card.suit] : "鬼";

  return (
    <article className={`old-maid-card-face ${joker ? "joker" : red ? "red" : "black"} ${removing ? "removing" : ""}`}>
      <span>{joker ? "J" : card.rank}</span>
      <strong>{mark}</strong>
      <em>{joker ? "JOKER" : card.rank}</em>
    </article>
  );
}

function CardBack({ index }: { index: number }) {
  return (
    <span className="old-maid-card-back" aria-hidden="true">
      <i>{index + 1}</i>
      <Ghost size={28} />
    </span>
  );
}

function useCountdown(deadline: number, version: number) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    function update() {
      setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    }

    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [deadline, version]);

  return seconds;
}

function usePhaseProgress(startedAt: number, deadline: number, version: number) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    function update() {
      const duration = deadline - startedAt;
      setProgress(
        duration > 0
          ? Math.max(0, Math.min(1, (Date.now() - startedAt) / duration))
          : 0
      );
    }

    update();
    const timer = window.setInterval(update, 50);
    return () => window.clearInterval(timer);
  }, [deadline, startedAt, version]);

  return progress;
}

function playerName(players: PublicOldMaidPlayer[], playerId: string) {
  return players.find((player) => player.id === playerId)?.nickname || "玩家";
}

function oldMaidOpponentPositions(count: number): RoomSeatPosition[] {
  if (count <= 1) return ["top"];
  if (count === 2) return ["left", "right"];
  if (count === 3) return ["top", "left", "right"];
  if (count === 4) return ["upper-left", "upper-right", "left", "right"];
  return ["top", "upper-left", "upper-right", "left", "right"];
}

function getTabClientId(scope: string) {
  const key = `poker-${scope}-client-id`;
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const next = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.sessionStorage.setItem(key, next);
  return next;
}

