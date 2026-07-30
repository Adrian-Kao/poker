"use client";

import {
  BookOpen,
  CheckCircle2,
  Clock3,
  Copy,
  Crown,
  Ghost,
  LogOut,
  Play,
  ShieldCheck,
  Users,
  Wifi,
  WifiOff
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Client, type Room } from "colyseus.js";
import type { OldMaidCard } from "../../../lib/games/old-maid";
import type { OldMaidServerEvent } from "../../../server/messages/oldMaidMessages";
import {
  OldMaidRoomStateSchema,
  type PublicOldMaidPlayer
} from "../../../server/schema/OldMaidRoomState";

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
                { nickname: name, roomCode: requestedRoom },
                OldMaidRoomStateSchema
              )
            : await client.create<OldMaidRoomStateSchema>(
                "old_maid",
                { nickname: name, maxPlayers },
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
            ? "已加入抽鬼牌等待室，請切換準備狀態。"
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
  const ownPlayer = players.find((player) => player.id === ownPlayerId);
  const ownReady = ownPlayer?.ready ?? false;
  const isHost = ownPlayer?.host ?? false;
  const isMyTurn = phase === "playing" && roomState?.currentPlayerId === ownPlayerId;
  const isDrawTarget = phase === "playing" && roomState?.targetPlayerId === ownPlayerId;
  const canUseRoom = status === "connected" && !!roomRef.current;
  const canStart =
    canUseRoom
    && isHost
    && phase === "waiting"
    && players.length >= 3
    && players.every((player) => player.connected && player.ready);
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

    if (isHost) send("CLOSE_ROOM");
    else void room.leave(true);

    window.setTimeout(() => {
      window.location.href = "/";
    }, 180);
  }

  if (phase === "waiting") {
    return (
      <main className="old-maid-shell">
        <OldMaidHeader
          roomCode={roomCode}
          round={roomState?.round ?? 1}
          status={status}
          onLeave={leaveRoom}
        />

        <section className="old-maid-lobby" aria-labelledby="old-maid-room-title">
          <div className="old-maid-lobby-heading">
            <div>
              <span className="stamp">等待室</span>
              <h1 id="old-maid-room-title">抽鬼牌房間</h1>
              <p>湊滿 3 至 6 位真人玩家，全員準備後由房主發牌。</p>
            </div>
            <div className="old-maid-room-code">
              <span>房號</span>
              <strong>{formatRoom(roomCode)}</strong>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(roomCode)}
              >
                <Copy size={19} />
                複製
              </button>
            </div>
          </div>

          <div className="old-maid-lobby-grid">
            {players.map((player) => (
              <LobbyPlayer
                isSelf={player.id === ownPlayerId}
                key={player.id}
                player={player}
              />
            ))}
            {Array.from({
              length: Math.max(0, (roomState?.maxPlayers ?? 4) - players.length)
            }).map((_, index) => (
              <article className="old-maid-lobby-card empty" key={index}>
                <Users size={30} />
                <strong>等待玩家</strong>
                <span>空位</span>
              </article>
            ))}
          </div>

          <div className="old-maid-lobby-actions">
            <button
              className={`old-maid-ready-button ${ownReady ? "is-ready" : ""}`}
              disabled={!canUseRoom}
              onClick={() => send("SET_READY", { ready: !ownReady })}
              type="button"
            >
              <CheckCircle2 size={22} />
              {ownReady ? "取消準備" : "我準備好了"}
            </button>
            {isHost ? (
              <button
                className="old-maid-start-button"
                disabled={!canStart}
                onClick={() => send("START_GAME")}
                type="button"
              >
                <Play size={22} />
                開始遊戲
              </button>
            ) : (
              <p>等待房主開始遊戲。</p>
            )}
          </div>

          <p className={`old-maid-connection-note ${status}`}>{statusText}</p>
        </section>

        <OldMaidStyles />
      </main>
    );
  }

  return (
    <main className="old-maid-shell">
      <OldMaidHeader
        roomCode={roomCode}
        round={roomState?.round ?? 1}
        status={status}
        onLeave={leaveRoom}
      />

      <section className="old-maid-table" aria-label="抽鬼牌牌桌">
        <div className="old-maid-opponents">
          {opponents.map((player) => (
            <OpponentPlayer
              cardsRemaining={
                phase === "dealing"
                  ? dealCounts[player.id] ?? 0
                  : phase === "shuffling"
                    ? 0
                    : player.cardsRemaining
              }
              isCurrent={player.id === roomState?.currentPlayerId}
              isTarget={player.id === roomState?.targetPlayerId}
              key={player.id}
              player={player}
            />
          ))}
        </div>

        {isOpening ? (
          <OpeningStage
            dealtCardCount={dealtCardCount}
            dealCounts={dealCounts}
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
          <div className={`old-maid-self-badge ${isMyTurn ? "active" : ""}`}>
            <span>{(nickname || "你").slice(0, 1)}</span>
            <div>
              <small>你的手牌</small>
              <strong>{nickname}</strong>
            </div>
            <b>{ownVisibleCardCount} 張</b>
          </div>

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
      </section>

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
      <OldMaidStyles />
    </main>
  );
}

function OldMaidHeader({
  roomCode,
  round,
  status,
  onLeave
}: {
  roomCode: string;
  round: number;
  status: ConnectionStatus;
  onLeave: () => void;
}) {
  return (
    <header className="old-maid-header">
      <a className="old-maid-brand" href="/" aria-label="返回鬥陣來一局首頁">
        <span>鬥陣</span>
        <strong>抽鬼牌</strong>
      </a>
      <div className="old-maid-header-meta">
        <span>
          房號 <strong>{formatRoom(roomCode)}</strong>
        </span>
        <span>
          第 <strong>{round}</strong> 局
        </span>
        <span className={`old-maid-status ${status}`}>
          {status === "connected" ? <Wifi size={18} /> : <WifiOff size={18} />}
          {connectionLabel(status)}
        </span>
        <span>
          <ShieldCheck size={18} />
          純娛樂
        </span>
      </div>
      <nav className="old-maid-header-actions" aria-label="牌局操作">
        <a href="/#games-title">
          <BookOpen size={20} />
          遊戲列表
        </a>
        <button type="button" onClick={onLeave}>
          <LogOut size={20} />
          離開牌局
        </button>
      </nav>
    </header>
  );
}

function LobbyPlayer({
  player,
  isSelf
}: {
  player: PublicOldMaidPlayer;
  isSelf: boolean;
}) {
  return (
    <article className={`old-maid-lobby-card ${player.ready ? "ready" : ""}`}>
      <span className="old-maid-lobby-avatar">
        {player.nickname.slice(0, 1) || "玩"}
      </span>
      <span>
        座位 {player.seat + 1}
        {player.host ? " · 房主" : ""}
      </span>
      <strong>
        {player.nickname}
        {isSelf ? "（你）" : ""}
      </strong>
      <b>{player.ready ? "已準備" : "未準備"}</b>
    </article>
  );
}

function OpeningStage({
  dealtCardCount,
  dealCounts,
  dealerPlayerId,
  phase,
  phaseProgress,
  players
}: {
  dealtCardCount: number;
  dealCounts: Record<string, number>;
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
          <div className="old-maid-opening-targets">
            {players.map((player, index) => (
              <div
                className={index === activePlayerIndex ? "active" : ""}
                key={player.id}
              >
                <span className="old-maid-avatar blue">
                  {player.nickname.slice(0, 1) || "玩"}
                </span>
                <strong>{player.nickname}</strong>
                <b>{dealCounts[player.id] ?? 0} 張</b>
              </div>
            ))}
          </div>
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

function OpponentPlayer({
  player,
  isCurrent,
  isTarget,
  cardsRemaining
}: {
  player: PublicOldMaidPlayer;
  isCurrent: boolean;
  isTarget: boolean;
  cardsRemaining?: number;
}) {
  const visibleCardsRemaining = cardsRemaining ?? player.cardsRemaining;
  return (
    <article
      className={`old-maid-opponent ${isCurrent ? "current" : ""} ${isTarget ? "target" : ""} ${player.status !== "playing" ? "safe" : ""}`}
    >
      <span className="old-maid-avatar blue">
        {player.nickname.slice(0, 1) || "玩"}
      </span>
      <div>
        <strong>{player.nickname}</strong>
        <span>{player.connected ? statusLabel(player.status) : "已離線"}</span>
      </div>
      <div className="old-maid-mini-cards" aria-label={`${visibleCardsRemaining} 張牌`}>
        {Array.from({
          length: Math.min(6, Math.max(0, visibleCardsRemaining))
        }).map((_, index) => (
          <i key={index} />
        ))}
      </div>
      <b>{visibleCardsRemaining} 張</b>
    </article>
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

function statusLabel(status: string) {
  if (status === "safe") return "安全出局";
  if (status === "loser") return "鬼牌在手";
  return "遊戲中";
}

function connectionLabel(status: ConnectionStatus) {
  if (status === "connected") return "已連線";
  if (status === "error") return "連線失敗";
  if (status === "closed") return "已離線";
  return "連線中";
}

function formatRoom(value: string) {
  const clean = value.replace(/\D/g, "").slice(0, 6).padEnd(6, "-");
  return `${clean.slice(0, 3)} ${clean.slice(3)}`;
}

function OldMaidStyles() {
  return (
    <style jsx global>{`
      .old-maid-shell {
        width: min(1500px, calc(100% - 32px));
        min-height: 100vh;
        margin: 0 auto;
        padding: 20px 0 42px;
      }

      .old-maid-header {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 22px;
        align-items: center;
        padding: 12px 16px;
        border: 4px solid var(--ink);
        background: var(--paper);
        box-shadow: 6px 6px 0 var(--ink);
      }

      .old-maid-brand {
        display: flex;
        align-items: center;
        gap: 10px;
        color: var(--ink);
        text-decoration: none;
      }

      .old-maid-brand span {
        padding: 8px 10px;
        background: var(--blue);
        color: white;
        font-weight: 950;
      }

      .old-maid-brand strong {
        font-size: 1.35rem;
        font-weight: 950;
      }

      .old-maid-header-meta,
      .old-maid-header-actions,
      .old-maid-header-meta span,
      .old-maid-header-actions a,
      .old-maid-header-actions button {
        display: flex;
        align-items: center;
      }

      .old-maid-header-meta {
        justify-content: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .old-maid-header-meta span {
        gap: 6px;
        padding: 7px 10px;
        border: 2px solid var(--ink);
        background: white;
        font-weight: 800;
      }

      .old-maid-header-meta .old-maid-status.connected {
        background: #d8f8e9;
      }

      .old-maid-header-meta .old-maid-status.error,
      .old-maid-header-meta .old-maid-status.closed {
        background: #ffd5d5;
      }

      .old-maid-header-actions {
        gap: 8px;
      }

      .old-maid-header-actions a,
      .old-maid-header-actions button,
      .old-maid-room-code button {
        gap: 7px;
        min-height: 42px;
        padding: 8px 12px;
        border: 3px solid var(--ink);
        background: var(--paper);
        color: var(--ink);
        box-shadow: 3px 3px 0 var(--ink);
        cursor: pointer;
        font-weight: 900;
        text-decoration: none;
      }

      .old-maid-header-actions button {
        background: var(--pink);
      }

      .old-maid-lobby {
        margin-top: 26px;
        padding: clamp(22px, 4vw, 46px);
        border: 5px solid var(--ink);
        border-radius: 28px;
        background: var(--paper);
        box-shadow: 10px 10px 0 var(--ink);
      }

      .old-maid-lobby-heading {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        align-items: end;
      }

      .old-maid-lobby-heading h1 {
        margin: 14px 0 8px;
        color: var(--blue);
        font-size: clamp(2.8rem, 7vw, 5.7rem);
        line-height: 0.95;
        text-shadow: 4px 4px 0 var(--yellow);
      }

      .old-maid-lobby-heading p {
        margin: 0;
        font-size: 1.05rem;
        font-weight: 750;
      }

      .old-maid-room-code {
        display: grid;
        min-width: 250px;
        gap: 5px;
        padding: 16px;
        border: 4px solid var(--ink);
        background: var(--yellow);
        box-shadow: 5px 5px 0 var(--ink);
      }

      .old-maid-room-code > span {
        font-weight: 900;
      }

      .old-maid-room-code > strong {
        font-size: 2.2rem;
        letter-spacing: 0.08em;
      }

      .old-maid-room-code button {
        justify-content: center;
        margin-top: 4px;
      }

      .old-maid-lobby-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(165px, 1fr));
        gap: 16px;
        margin-top: 34px;
      }

      .old-maid-lobby-card {
        min-height: 190px;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 9px;
        padding: 18px;
        border: 4px solid var(--ink);
        border-radius: 12px;
        background: white;
        box-shadow: 5px 5px 0 var(--ink);
      }

      .old-maid-lobby-card.ready {
        background: #d8f8e9;
      }

      .old-maid-lobby-card.empty {
        justify-content: center;
        align-items: center;
        border-style: dashed;
        background: #eee8dc;
        color: #6d685f;
      }

      .old-maid-lobby-avatar,
      .old-maid-avatar {
        display: grid;
        place-items: center;
        border: 3px solid var(--ink);
        border-radius: 50%;
        background: var(--yellow);
        font-size: 1.25rem;
        font-weight: 950;
      }

      .old-maid-lobby-avatar {
        width: 54px;
        height: 54px;
      }

      .old-maid-lobby-card > strong {
        font-size: 1.2rem;
      }

      .old-maid-lobby-card > b {
        margin-top: auto;
        padding: 5px 8px;
        border: 2px solid var(--ink);
        background: var(--yellow);
      }

      .old-maid-lobby-actions {
        display: flex;
        align-items: center;
        gap: 14px;
        flex-wrap: wrap;
        margin-top: 30px;
      }

      .old-maid-lobby-actions button,
      .old-maid-result button {
        display: inline-flex;
        min-height: 52px;
        align-items: center;
        justify-content: center;
        gap: 9px;
        padding: 12px 18px;
        border: 4px solid var(--ink);
        box-shadow: 5px 5px 0 var(--ink);
        cursor: pointer;
        font-weight: 950;
      }

      .old-maid-ready-button {
        background: white;
      }

      .old-maid-ready-button.is-ready {
        background: var(--green);
      }

      .old-maid-start-button,
      .old-maid-result button {
        background: var(--yellow);
      }

      .old-maid-lobby-actions button:disabled {
        cursor: not-allowed;
        filter: grayscale(1);
        opacity: 0.48;
      }

      .old-maid-lobby-actions p {
        font-weight: 850;
      }

      .old-maid-connection-note {
        margin: 20px 0 0;
        font-weight: 800;
      }

      .old-maid-connection-note.error,
      .old-maid-connection-note.closed {
        color: #aa1e34;
      }

      .old-maid-table {
        position: relative;
        min-height: 780px;
        margin-top: 24px;
        padding: 24px;
        overflow: hidden;
        border: 6px solid var(--ink);
        border-radius: 58px;
        background:
          radial-gradient(circle at center, rgba(255, 255, 255, 0.16), transparent 48%),
          #168260;
        box-shadow: 12px 12px 0 rgba(16, 16, 16, 0.42);
      }

      .old-maid-opponents {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(185px, 1fr));
        gap: 12px;
      }

      .old-maid-opponent {
        min-width: 0;
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 9px;
        align-items: center;
        padding: 10px;
        border: 3px solid var(--ink);
        border-radius: 12px;
        background: var(--paper);
        box-shadow: 4px 4px 0 rgba(16, 16, 16, 0.68);
      }

      .old-maid-opponent.current {
        background: var(--yellow);
      }

      .old-maid-opponent.target {
        outline: 4px solid var(--pink);
        outline-offset: 3px;
      }

      .old-maid-opponent.safe {
        opacity: 0.67;
      }

      .old-maid-avatar {
        width: 44px;
        height: 44px;
      }

      .old-maid-avatar.blue {
        background: var(--blue);
        color: white;
      }

      .old-maid-avatar.yellow {
        background: var(--yellow);
        color: var(--ink);
      }

      .old-maid-avatar.pink {
        background: var(--pink);
        color: var(--ink);
      }

      .old-maid-opponent > div:nth-child(2) {
        display: grid;
        gap: 2px;
      }

      .old-maid-opponent > div:nth-child(2) span {
        font-size: 0.82rem;
        font-weight: 750;
      }

      .old-maid-opponent > b {
        white-space: nowrap;
        font-size: 0.86rem;
      }

      .old-maid-mini-cards {
        display: flex;
        justify-content: flex-end;
        min-width: 32px;
      }

      .old-maid-mini-cards i {
        width: 17px;
        height: 25px;
        margin-left: -10px;
        border: 2px solid var(--ink);
        border-radius: 2px;
        background: var(--blue);
      }

      .old-maid-opening-stage {
        position: absolute;
        top: 48%;
        left: 50%;
        z-index: 3;
        width: min(900px, calc(100% - 48px));
        min-height: 390px;
        display: grid;
        align-content: center;
        justify-items: center;
        gap: 18px;
        transform: translate(-50%, -50%);
      }

      .old-maid-opening-copy {
        z-index: 3;
        display: grid;
        justify-items: center;
        gap: 3px;
        padding: 10px 16px;
        border: 3px solid var(--ink);
        background: var(--paper);
        box-shadow: 4px 4px 0 var(--ink);
        text-align: center;
      }

      .old-maid-opening-copy > span {
        padding: 2px 7px;
        background: var(--yellow);
        font-size: 0.78rem;
        font-weight: 950;
      }

      .old-maid-opening-copy > strong {
        font-size: clamp(1.45rem, 4vw, 2.35rem);
      }

      .old-maid-opening-copy > small {
        font-weight: 750;
      }

      .old-maid-opening-board {
        position: relative;
        width: 100%;
        min-height: 225px;
      }

      .old-maid-opening-targets {
        position: absolute;
        inset: 0 0 auto;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
        gap: 8px;
      }

      .old-maid-opening-targets > div {
        display: grid;
        justify-items: center;
        gap: 2px;
        padding: 6px;
        opacity: 0.78;
        transition: transform 120ms ease, opacity 120ms ease;
      }

      .old-maid-opening-targets > div.active {
        opacity: 1;
        transform: translateY(-7px);
      }

      .old-maid-opening-targets > div.active .old-maid-avatar {
        background: var(--yellow);
        color: var(--ink);
      }

      .old-maid-opening-targets strong,
      .old-maid-opening-targets b {
        padding: 1px 5px;
        background: var(--paper);
        font-size: 0.75rem;
      }

      .old-maid-opening-deck {
        position: absolute;
        right: 50%;
        bottom: 0;
        width: 74px;
        height: 105px;
        transform: translateX(50%);
      }

      .old-maid-opening-deck .old-maid-card-back {
        position: absolute;
        inset: 0;
        width: 70px;
      }

      .phase-shuffling .old-maid-opening-deck .old-maid-card-back:nth-child(1) {
        animation: old-maid-shuffle-left 480ms ease-in-out infinite alternate;
      }

      .phase-shuffling .old-maid-opening-deck .old-maid-card-back:nth-child(2) {
        animation: old-maid-shuffle-right 520ms ease-in-out infinite alternate;
      }

      .phase-shuffling .old-maid-opening-deck .old-maid-card-back:nth-child(3) {
        animation: old-maid-shuffle-top 420ms ease-in-out infinite alternate;
      }

      .old-maid-opening-flying {
        position: absolute;
        right: 50%;
        bottom: 0;
        z-index: 2;
        animation: old-maid-deal-card 80ms linear both;
      }

      .old-maid-opening-flying .old-maid-card-back {
        width: 58px;
      }

      .old-maid-opening-flying.target-0 { --deal-x: -340px; --deal-y: -145px; }
      .old-maid-opening-flying.target-1 { --deal-x: -220px; --deal-y: -170px; }
      .old-maid-opening-flying.target-2 { --deal-x: -85px; --deal-y: -185px; }
      .old-maid-opening-flying.target-3 { --deal-x: 75px; --deal-y: -185px; }
      .old-maid-opening-flying.target-4 { --deal-x: 210px; --deal-y: -170px; }
      .old-maid-opening-flying.target-5 { --deal-x: 330px; --deal-y: -145px; }

      .old-maid-opening-status {
        display: grid;
        min-width: 210px;
        min-height: 86px;
        place-items: center;
        border: 4px solid var(--ink);
        background: var(--yellow);
        box-shadow: 6px 6px 0 var(--ink);
        font-size: 1.15rem;
        font-weight: 950;
      }

      .phase-organizing .old-maid-opening-status {
        background: var(--pink);
      }

      .old-maid-opening-progress {
        width: min(440px, 80%);
        height: 13px;
        overflow: hidden;
        border: 3px solid var(--ink);
        background: var(--paper);
      }

      .old-maid-opening-progress > i {
        display: block;
        height: 100%;
        background: var(--yellow);
        transition: width 50ms linear;
      }

      .old-maid-draw-stage {
        position: absolute;
        top: 47%;
        left: 50%;
        width: min(920px, calc(100% - 48px));
        min-height: 305px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        transform: translate(-50%, -50%);
      }

      .old-maid-turn-line,
      .old-maid-turn-title,
      .old-maid-target-message,
      .old-maid-spectator-message,
      .old-maid-notice {
        border: 3px solid var(--ink);
        background: var(--paper);
        box-shadow: 4px 4px 0 var(--ink);
      }

      .old-maid-turn-line {
        display: flex;
        gap: 14px;
        align-items: center;
        padding: 7px 12px;
        font-weight: 850;
      }

      .old-maid-clock {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        color: #b11732;
      }

      .old-maid-turn-title {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 12px;
        padding: 11px 16px;
      }

      .old-maid-turn-title > div {
        display: grid;
      }

      .old-maid-turn-title small {
        font-weight: 750;
      }

      .old-maid-turn-title strong {
        font-size: 1.1rem;
      }

      .old-maid-arrow {
        font-size: 1.65rem;
        font-weight: 950;
      }

      .old-maid-stage-hint {
        margin: 14px 0 7px;
        padding: 5px 9px;
        background: var(--yellow);
        font-weight: 850;
      }

      .old-maid-draw-rack,
      .old-maid-passive-rack,
      .old-maid-hand {
        width: 100%;
        display: flex;
        gap: 8px;
        overflow-x: auto;
        padding: 10px 8px 16px;
        scrollbar-color: var(--ink) transparent;
      }

      .old-maid-draw-rack {
        justify-content: safe center;
      }

      .old-maid-draw-rack > button {
        flex: 0 0 auto;
        padding: 0;
        border: 0;
        background: transparent;
        cursor: pointer;
        transition: transform 150ms ease;
      }

      .old-maid-draw-rack > button:hover:not(:disabled),
      .old-maid-draw-rack > button:focus-visible {
        transform: translateY(-12px) rotate(-2deg);
      }

      .old-maid-draw-rack > button.pending {
        transform: translateY(-18px);
        opacity: 0.6;
      }

      .old-maid-draw-rack > button:disabled:not(.pending) {
        opacity: 0.6;
      }

      .old-maid-card-back,
      .old-maid-card-face {
        position: relative;
        width: clamp(62px, 6.4vw, 88px);
        aspect-ratio: 0.7;
        flex: 0 0 auto;
        border: 4px solid var(--ink);
        border-radius: 8px;
        box-shadow: 4px 4px 0 var(--ink);
      }

      .old-maid-card-back {
        display: grid;
        place-items: center;
        background:
          repeating-linear-gradient(45deg, transparent 0 8px, rgba(255, 255, 255, 0.18) 8px 12px),
          var(--blue);
        color: white;
      }

      .old-maid-card-back::after {
        content: "";
        position: absolute;
        inset: 6px;
        border: 2px solid white;
        border-radius: 4px;
      }

      .old-maid-card-back > i {
        position: absolute;
        top: 8px;
        left: 9px;
        z-index: 1;
        font-size: 0.78rem;
        font-style: normal;
        font-weight: 900;
      }

      .old-maid-passive-rack {
        max-width: 740px;
        justify-content: center;
        margin-top: 12px;
      }

      .old-maid-target-message,
      .old-maid-spectator-message {
        max-width: 540px;
        display: grid;
        justify-items: center;
        gap: 7px;
        margin-top: 18px;
        padding: 16px 22px;
        text-align: center;
      }

      .old-maid-target-message strong,
      .old-maid-spectator-message strong {
        font-size: 1.15rem;
      }

      .old-maid-target-message span,
      .old-maid-spectator-message span {
        font-weight: 750;
      }

      .old-maid-spectator-message {
        background: var(--paper);
      }

      .old-maid-notice {
        max-width: 680px;
        margin: 12px 0 0;
        padding: 7px 12px;
        font-weight: 850;
        text-align: center;
      }

      .old-maid-self-area {
        position: absolute;
        right: 24px;
        bottom: 20px;
        left: 24px;
        display: grid;
        justify-items: center;
      }

      .old-maid-self-badge {
        z-index: 2;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 12px;
        border: 3px solid var(--ink);
        background: var(--paper);
        box-shadow: 4px 4px 0 var(--ink);
      }

      .old-maid-self-badge.active {
        background: var(--yellow);
      }

      .old-maid-self-badge > span {
        width: 42px;
        height: 42px;
        display: grid;
        place-items: center;
        border: 3px solid var(--ink);
        border-radius: 50%;
        background: var(--pink);
        font-weight: 950;
      }

      .old-maid-self-badge > div {
        display: grid;
      }

      .old-maid-self-badge > b {
        margin-left: 8px;
      }

      .old-maid-hand {
        justify-content: safe center;
        min-height: 165px;
      }

      .old-maid-card-face {
        display: grid;
        grid-template-rows: auto 1fr auto;
        padding: 8px;
        background: white;
        font-style: normal;
      }

      .old-maid-card-face > span,
      .old-maid-card-face > em {
        font-size: 0.92rem;
        font-style: normal;
        font-weight: 950;
      }

      .old-maid-card-face > em {
        justify-self: end;
        transform: rotate(180deg);
      }

      .old-maid-card-face > strong {
        place-self: center;
        font-size: clamp(1.7rem, 3vw, 2.5rem);
      }

      .old-maid-card-face.red {
        color: #d52442;
      }

      .old-maid-card-face.black {
        color: var(--ink);
      }

      .old-maid-card-face.joker {
        background: var(--yellow);
        color: var(--blue);
      }

      .old-maid-card-face.removing {
        pointer-events: none;
        animation: old-maid-pair-out 360ms ease-in both;
      }

      .old-maid-deal-progress {
        margin-top: 14px;
        padding: 10px 14px;
        border: 3px solid var(--ink);
        background: var(--paper);
        box-shadow: 4px 4px 0 var(--ink);
        font-weight: 850;
      }

      .old-maid-safe-note {
        display: flex;
        align-items: center;
        gap: 9px;
        margin-top: 14px;
        padding: 12px 16px;
        border: 3px solid var(--ink);
        background: #d8f8e9;
        box-shadow: 4px 4px 0 var(--ink);
        font-weight: 900;
      }

      .old-maid-ready-overlay {
        position: fixed;
        inset: 50% auto auto 50%;
        z-index: 30;
        width: min(680px, calc(100% - 32px));
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 22px 26px;
        border: 6px solid var(--ink);
        background: var(--yellow);
        box-shadow: 10px 10px 0 var(--ink);
        text-align: center;
        transform: translate(-50%, -50%);
        animation: old-maid-ready-in 1500ms ease both;
      }

      .old-maid-ready-overlay::before {
        content: "";
        position: fixed;
        inset: -100vh -100vw;
        z-index: -1;
        background: rgba(16, 16, 16, 0.38);
      }

      .old-maid-ready-overlay strong {
        font-size: clamp(1.35rem, 5vw, 2.35rem);
      }

      .old-maid-result {
        position: fixed;
        inset: 50% auto auto 50%;
        z-index: 20;
        width: min(520px, calc(100% - 32px));
        display: grid;
        justify-items: center;
        gap: 10px;
        padding: 28px;
        border: 6px solid var(--ink);
        background: var(--paper);
        box-shadow: 12px 12px 0 var(--ink);
        text-align: center;
        transform: translate(-50%, -50%);
      }

      .old-maid-result::before {
        content: "";
        position: fixed;
        inset: -100vh -100vw;
        z-index: -1;
        background: rgba(16, 16, 16, 0.55);
      }

      .old-maid-result span {
        font-weight: 900;
      }

      .old-maid-result h2 {
        margin: 0;
        color: var(--blue);
        font-size: clamp(2rem, 7vw, 3.6rem);
        line-height: 1;
      }

      .old-maid-result p {
        margin: 0 0 8px;
        font-weight: 750;
      }

      @keyframes old-maid-shuffle-left {
        to { transform: translate(-30px, 4px) rotate(-12deg); }
      }

      @keyframes old-maid-shuffle-right {
        to { transform: translate(30px, -3px) rotate(11deg); }
      }

      @keyframes old-maid-shuffle-top {
        to { transform: translateY(-16px) rotate(3deg); }
      }

      @keyframes old-maid-deal-card {
        from {
          opacity: 1;
          transform: translate(50%, 0) scale(1);
        }
        to {
          opacity: 0.82;
          transform: translate(calc(50% + var(--deal-x)), var(--deal-y)) scale(0.56);
        }
      }

      @keyframes old-maid-pair-out {
        45% {
          opacity: 1;
          transform: translateY(-26px) rotate(6deg);
        }
        to {
          opacity: 0;
          transform: translateY(-85px) rotate(15deg) scale(0.78);
        }
      }

      @keyframes old-maid-ready-in {
        0%,
        100% {
          opacity: 0;
          transform: translate(-50%, -46%) scale(0.96);
        }
        15%,
        78% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
      }

      @media (max-width: 980px) {
        .old-maid-header {
          grid-template-columns: 1fr auto;
        }

        .old-maid-header-meta {
          grid-column: 1 / -1;
          grid-row: 2;
          justify-content: flex-start;
        }

        .old-maid-table {
          min-height: 850px;
        }

        .old-maid-opponents {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .old-maid-draw-stage {
          top: 48%;
        }
      }

      @media (max-width: 680px) {
        .old-maid-shell {
          width: min(100% - 18px, 1500px);
          padding-top: 10px;
        }

        .old-maid-header {
          gap: 10px;
          padding: 9px;
        }

        .old-maid-brand strong {
          font-size: 1.08rem;
        }

        .old-maid-header-actions a {
          display: none;
        }

        .old-maid-header-meta {
          gap: 5px;
        }

        .old-maid-header-meta span {
          padding: 5px 7px;
          font-size: 0.8rem;
        }

        .old-maid-lobby {
          padding: 18px;
          border-radius: 18px;
        }

        .old-maid-lobby-heading {
          align-items: stretch;
          flex-direction: column;
        }

        .old-maid-room-code {
          min-width: 0;
        }

        .old-maid-lobby-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .old-maid-lobby-card {
          min-height: 165px;
          padding: 12px;
        }

        .old-maid-lobby-actions {
          align-items: stretch;
          flex-direction: column;
        }

        .old-maid-table {
          min-height: 820px;
          padding: 12px;
          border-width: 4px;
          border-radius: 24px;
        }

        .old-maid-opponents {
          gap: 7px;
        }

        .old-maid-opponent {
          grid-template-columns: auto 1fr;
          padding: 7px;
        }

        .old-maid-opponent > b {
          grid-column: 2;
        }

        .old-maid-mini-cards {
          display: none;
        }

        .old-maid-draw-stage {
          top: 47%;
          width: calc(100% - 18px);
        }

        .old-maid-opening-stage {
          top: 46%;
          width: calc(100% - 18px);
        }

        .old-maid-opening-targets {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .old-maid-opening-targets .old-maid-avatar {
          width: 36px;
          height: 36px;
          font-size: 1rem;
        }

        .old-maid-opening-flying {
          display: none;
        }

        .old-maid-turn-title {
          gap: 7px;
          padding: 8px;
        }

        .old-maid-turn-title .old-maid-avatar {
          width: 36px;
          height: 36px;
          font-size: 1rem;
        }

        .old-maid-card-back,
        .old-maid-card-face {
          width: 62px;
          border-width: 3px;
        }

        .old-maid-self-area {
          right: 8px;
          bottom: 10px;
          left: 8px;
        }

        .old-maid-hand {
          justify-content: flex-start;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .old-maid-opening-deck .old-maid-card-back,
        .old-maid-opening-flying,
        .old-maid-card-face.removing,
        .old-maid-ready-overlay {
          animation: none;
        }

        .old-maid-card-face.removing {
          opacity: 0.25;
        }

        .old-maid-opening-flying {
          display: none;
        }
      }
    `}</style>
  );
}
