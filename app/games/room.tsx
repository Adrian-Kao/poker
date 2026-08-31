"use client";

import { useState, type ReactNode } from "react";
import { Bot, BookOpen, Copy, LogOut, Play, ShieldCheck, Wifi, WifiOff } from "lucide-react";

export type RoomConnectionStatus = "connecting" | "connected" | "error" | "closed" | string;
export type RoomSeatPosition = "top" | "left" | "right" | "upper-left" | "upper-right";

export type RoomPlayer = {
  id: string;
  seat: number;
  nickname: string;
  host?: boolean;
  ready?: boolean;
  connected?: boolean;
  type?: "human" | "bot" | string;
  botDifficulty?: string;
  cardsRemaining?: number;
  score?: number;
  status?: string;
};

type RoomHeaderProps = {
  gameName: string;
  roomCode: string;
  round?: number;
  status: RoomConnectionStatus;
  realOnly?: boolean;
  docsHref?: string;
  onLeave: () => void;
};

export function RoomHeader({ gameName, roomCode, round = 1, status, realOnly = false, docsHref = "/", onLeave }: RoomHeaderProps) {
  const connected = status === "connected";
  return (
    <header className="bluff-topbar room-topbar">
      <a className="bluff-logo" href="/" aria-label="鬥陣首頁">鬥陣</a>
      <h1>{gameName}</h1>
      <div className="bluff-meta">
        <span>房號 <b>{formatRoom(roomCode)}</b></span>
        <span>第 <b>{round}</b> 局</span>
        <strong className={`room-connection ${status}`}>
          {connected ? <Wifi size={18} /> : <WifiOff size={18} />}
          {connected ? "已連線" : status === "connecting" ? "連線中" : "連線異常"}
        </strong>
        <strong className="room-entertainment"><ShieldCheck size={18} />{realOnly ? "只限真人" : "純娛樂"}</strong>
      </div>
      <nav className="bluff-actions" aria-label="牌局操作">
        <a href={docsHref}><BookOpen size={22} />玩法</a>
        <button type="button" onClick={onLeave}><LogOut size={22} />離開牌局</button>
      </nav>
    </header>
  );
}

export const UnifiedGameHeader = RoomHeader;

type ResponsiveGameLayoutProps = {
  gameName: string;
  className?: string;
  children: ReactNode;
  aside?: ReactNode;
  controls?: ReactNode;
};

export function ResponsiveGameLayout({ gameName, className = "", children, aside, controls }: ResponsiveGameLayoutProps) {
  return (
    <>
      <div className={`shared-room-layout responsive-game-layout ${aside ? "has-aside" : ""}`}>
        <section className={`bluff-table shared-room-table responsive-game-table ${className}`} aria-label={`${gameName}牌桌`}>
          {children}
        </section>
        {aside ? <aside className="shared-room-aside">{aside}</aside> : null}
      </div>
      {controls ? <section className="shared-room-controls responsive-action-bar">{controls}</section> : null}
    </>
  );
}

export function RoomTable(props: ResponsiveGameLayoutProps) {
  return <ResponsiveGameLayout {...props} />;
}

export function RoomOpponentSeat({ player, position, active = false, passed = false }: { player?: Pick<RoomPlayer, "id" | "nickname" | "type" | "connected" | "cardsRemaining" | "score" | "status">; position: RoomSeatPosition; active?: boolean; passed?: boolean }) {
  if (!player) return null;
  const count = player.cardsRemaining ?? 0;
  return (
    <article className={`bluff-opponent-seat room-opponent-seat ${position} ${active ? "active" : ""} ${player.status === "finished" ? "finished" : ""}`}>
      <div className="bluff-player-badge">
        <div className="bluff-avatar">{player.nickname.trim().slice(0, 1) || "玩"}</div>
        <div><strong>{player.nickname}</strong><span>{count} 張牌{typeof player.score === "number" ? `　${player.score} 分` : ""}</span></div>
        <em>{player.type === "bot" ? "電腦" : player.connected === false ? "重新連線中" : "真人"}</em>
      </div>
      <RoomCardBacks count={count} />
      {active ? <b className="room-seat-state">目前回合</b> : null}
      {passed ? <b className="room-seat-state pass">PASS</b> : null}
    </article>
  );
}

export function RoomCardBacks({ count, max = 5 }: { count: number; max?: number }) {
  return <div className="bluff-card-back-stack room-card-backs" aria-hidden="true">{Array.from({ length: Math.min(max, Math.max(1, count)) }).map((_, index) => <i key={index} />)}</div>;
}

export function RoomSelfBadge({ nickname, active = false, count, score }: { nickname: string; active?: boolean; count?: number; score?: number }) {
  return (
    <div className={`bluff-self-badge room-self-badge ${active ? "active" : ""}`}>
      <div className="bluff-avatar yellow">{nickname.trim().slice(0, 1) || "你"}</div>
      <div><span>你的手牌</span><strong>{nickname}</strong>{typeof count === "number" ? <em>{count} 張牌{typeof score === "number" ? `　${score} 分` : ""}</em> : null}</div>
    </div>
  );
}

export type UnifiedConnectionStatus = RoomConnectionStatus;
export type UnifiedPlayer = RoomPlayer;
export type RoomBotDifficulty = "easy" | "normal" | "hard";

type UnifiedWaitingRoomProps = {
  gameName: string;
  roomCode: string;
  round?: number;
  status: RoomConnectionStatus;
  statusText: string;
  players: RoomPlayer[];
  maxPlayers: number;
  ownId: string;
  isHost: boolean;
  canUseRoom: boolean;
  canStart: boolean;
  allowBots?: boolean;
  realOnly?: boolean;
  minPlayers?: number;
  docsHref?: string;
  settings?: ReactNode;
  onAddBot?: (difficulty: RoomBotDifficulty) => void;
  onStart: () => void;
  onLeave: () => void;
};

const botDifficultyOptions: Array<{ value: RoomBotDifficulty; label: string }> = [
  { value: "easy", label: "簡單" },
  { value: "normal", label: "普通" },
  { value: "hard", label: "困難" }
];

export function UnifiedWaitingRoom({ gameName, roomCode, round = 1, status, statusText, players, maxPlayers, ownId, isHost, canUseRoom, canStart, allowBots = false, realOnly = false, minPlayers = 2, docsHref, settings, onAddBot, onStart, onLeave }: UnifiedWaitingRoomProps) {
  const emptySeats = Math.max(0, maxPlayers - players.length);
  const [botDifficulty, setBotDifficulty] = useState<RoomBotDifficulty>("normal");
  return (
    <main className="heart-auto-shell ninety-online-shell">
      <RoomHeader gameName={gameName} roomCode={roomCode} round={round} status={status} realOnly={realOnly} docsHref={docsHref} onLeave={onLeave} />
      <section className="heart-waiting-room ninety-waiting-room unified-waiting-room">
        <div className="waiting-room-title"><span className="stamp">等待室</span><h1>{gameName} 房間</h1></div>
        <div className="waiting-room-code"><span>{formatRoom(roomCode)}</span><button type="button" onClick={() => navigator.clipboard?.writeText(roomCode)}><Copy size={18} />複製房號</button></div>
        {settings || allowBots ? <div className="room-waiting-settings">
          {settings}
          {allowBots ? <fieldset className="room-bot-settings" disabled={!isHost || !canUseRoom}>
            
            <div className="room-bot-difficulty" aria-label="電腦強度">
              {botDifficultyOptions.map((option) => <button
                key={option.value}
                type="button"
                className={botDifficulty === option.value ? "active" : ""}
                onClick={() => setBotDifficulty(option.value)}
                aria-pressed={botDifficulty === option.value}
              >{option.label}</button>)}
            </div>
            
          </fieldset> : null}
        </div> : null}
        <div className="heart-lobby-list ninety-lobby-list">{players.map((player) => <WaitingSeat key={player.id} player={player} isSelf={player.id === ownId} />)}{Array.from({ length: emptySeats }).map((_, index) => <EmptyWaitingSeat key={`empty-${index}`} seatNumber={players.length + index + 1} />)}</div>
        <div className="heart-lobby-actions">
          {allowBots && onAddBot ? <button type="button" className="ready-button bot-button" onClick={() => onAddBot(botDifficulty)} disabled={!isHost || !canUseRoom || players.length >= maxPlayers}><Bot size={22} />加電腦補位</button> : null}
          {isHost ? <button type="button" className="play-card-button compact-action" onClick={onStart} disabled={!canStart || players.length < minPlayers}><Play size={20} />開始遊戲</button> : null}
        </div>
        <p className="waiting-room-hint">{gameName} 支援 {minPlayers} 至 {maxPlayers} 位玩家；所有座位有人後由房主開始。</p>
        <p className={`connection-note ${status}`}>{statusText}</p>
      </section>
    </main>
  );
}

function WaitingSeat({ player, isSelf }: { player: RoomPlayer; isSelf: boolean }) {
  return <article className={`heart-lobby-seat lobby-${player.seat % 2 === 0 ? "yellow" : "green"} ready`}><span className="lobby-card-corner">{player.nickname.slice(0, 1) || "玩"}</span><span>座位 {player.seat + 1}{player.host ? " · 房主" : ""}</span><strong>{player.nickname}{isSelf ? "（你）" : ""}</strong><em>{player.type === "bot" ? `電腦玩家${player.botDifficulty ? ` · ${formatDifficulty(player.botDifficulty)}` : ""}` : "真人玩家"}</em><b>已加入</b></article>;
}

function EmptyWaitingSeat({ seatNumber }: { seatNumber: number }) {
  return <article className="heart-lobby-seat lobby-empty-seat" aria-label={`座位 ${seatNumber} 等待玩家`}><span className="empty-seat-icon" aria-hidden="true">♙</span><strong>等待玩家</strong><em>空位</em></article>;
}

export function formatRoom(value: string) {
  const clean = value.replace(/\D/g, "").slice(0, 6).padEnd(6, "-");
  return `${clean.slice(0, 3)} ${clean.slice(3)}`;
}

function formatDifficulty(value: string) {
  if (value === "easy" || value === "簡單") return "簡單";
  if (value === "hard" || value === "困難") return "困難";
  return "普通";
}
