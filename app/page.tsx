"use client";

import { Bot, Check, Copy, DoorOpen, Hash, Info, Play, Plus, ShieldCheck, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { games, type Game } from "./data/games";

const seatNames = ["阿哲", "小萱", "冠宇", "怡君", "志明", "美玲"];

export default function Home() {
  const [selectedGameId, setSelectedGameId] = useState("ninety-nine");
  const [nickname, setNickname] = useState("阿德");
  const [roomCode, setRoomCode] = useState("168299");
  const [targetPlayers, setTargetPlayers] = useState(4);
  const [botCount, setBotCount] = useState(1);
  const [difficulty, setDifficulty] = useState("普通");
  const [copied, setCopied] = useState(false);
  const [ready, setReady] = useState(true);

  const game = games.find((item) => item.id === selectedGameId) ?? games[3];
  const humanPlayers = Math.max(1, targetPlayers - (game.bots ? botCount : 0));
  const canStartRealOnly = !game.realOnly || humanPlayers >= targetPlayers;
  const codeIsValid = /^\d{6}$/.test(roomCode);

  const seats = useMemo(() => {
    const humans = Array.from({ length: humanPlayers }, (_, index) => ({
      name: index === 0 ? nickname || "房主" : seatNames[index] ?? `玩家 ${index + 1}`,
      type: index === 0 ? "房主" : "真人",
      ready: index < 2 || ready
    }));

    const bots = game.bots
      ? Array.from({ length: botCount }, (_, index) => ({
          name: `電腦 ${index + 1}`,
          type: difficulty,
          ready: true
        }))
      : [];

    const waiting = Array.from({ length: Math.max(0, targetPlayers - humans.length - bots.length) }, (_, index) => ({
      name: `等待座位 ${index + 1}`,
      type: "邀請中",
      ready: false
    }));

    return [...humans, ...bots, ...waiting];
  }, [botCount, difficulty, game.bots, humanPlayers, nickname, ready, targetPlayers]);

  function selectGame(nextGame: Game) {
    setSelectedGameId(nextGame.id);
    setTargetPlayers(Math.min(Math.max(targetPlayers, nextGame.min), nextGame.max));
    if (!nextGame.bots) {
      setBotCount(0);
    }
  }

  function copyCode() {
    navigator.clipboard?.writeText(roomCode).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  function startGame() {
    if (!canStartRealOnly) return;
    const params = new URLSearchParams({
      room: roomCode,
      nick: nickname || "玩家",
      players: String(targetPlayers),
      bots: String(game.bots ? botCount : 0),
      difficulty
    });
    window.location.href = `/games/${game.slug}?${params.toString()}`;
  }

  return (
    <main className="site-shell">
      <section className="hero-grid" aria-labelledby="site-title">
        <div className="hero-copy">
          <p className="stamp">台灣撲克牌線上房</p>
          <h1 id="site-title">誒!打牌阿!</h1>
          <p className="hero-text">
            輸入暱稱就能開私人房，六位數房號分享給朋友。
          </p>
          <div className="hero-actions" aria-label="主要操作">
            <a className="primary-action" href="#create-room">
              <Plus size={22} />
              建立房間
            </a>
            <a className="secondary-action" href="#join-room">
              <Hash size={22} />
              輸入房號
            </a>
          </div>
        </div>

        <div className="poster" aria-label="朋友聚會撲克牌插圖">
          <div className="poster-sun">純娛樂</div>
          <div className="table-scene">
            <span className="card-chip blue">排七</span>
            <span className="card-chip yellow">九九</span>
            <span className="card-chip cream">大老二</span>
            <div className="hand-row">
              <span>J</span>
              <span>Q</span>
              <span>K</span>
              <span>A</span>
            </div>
          </div>
        </div>
      </section>

      <section className="notice-band" aria-label="產品定位">
        <div>
          <ShieldCheck />
          不下注、不儲值、不做娛樂城
        </div>
        <div>
          <DoorOpen />
          私人房間，開局後禁止加入
        </div>
        <div>
          <Bot />
          電腦玩家不偷看隱藏手牌
        </div>
      </section>

      <section className="section-block" aria-labelledby="games-title">
        <div className="section-heading">
          <p className="stamp">七款台灣玩法</p>
          <h2 id="games-title">先選今天要玩哪一局</h2>
        </div>
        <div className="game-grid">
          {games.map((item) => (
            <button
              className={`game-card ${item.id === game.id ? "active" : ""}`}
              key={item.id}
              onClick={() => selectGame(item)}
              type="button"
            >
              <span className="game-name">{item.name}</span>
              <span className="game-players">
                <Users size={17} />
                {item.players}
              </span>
              <span className="game-note">{item.note}</span>
              {item.realOnly && <strong className="real-only">只限真人</strong>}
            </button>
          ))}
        </div>
      </section>

      <section className="control-grid" id="create-room">
        <div className="tool-panel">
          <div className="panel-title">
            <Play />
            <h2>建立房間</h2>
          </div>

          <label>
            遊戲
            <select value={game.id} onChange={(event) => selectGame(games.find((item) => item.id === event.target.value) ?? game)}>
              {games.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            玩家暱稱
            <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={12} />
          </label>

          <label>
            遊戲人數
            <input
              type="range"
              min={game.min}
              max={game.max}
              value={targetPlayers}
              onChange={(event) => setTargetPlayers(Number(event.target.value))}
            />
            <span className="range-value">{targetPlayers} 人</span>
          </label>

          {game.bots ? (
            <>
              <label>
                電腦玩家
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, targetPlayers - 1)}
                  value={botCount}
                  onChange={(event) => setBotCount(Number(event.target.value))}
                />
                <span className="range-value">{botCount} 位</span>
              </label>
              <div className="segmented" aria-label="電腦難度">
                {["簡單", "普通", "困難"].map((level) => (
                  <button
                    className={difficulty === level ? "selected" : ""}
                    key={level}
                    onClick={() => setDifficulty(level)}
                    type="button"
                  >
                    {level}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="rule-callout strong">
              <X size={20} />
              {game.name} 只開放真人玩家，真人到齊前不能開始。
            </div>
          )}

          <div className="summary-box">
            <strong>{game.name}</strong>
            <span>{targetPlayers} 人房，{humanPlayers} 位真人，{game.bots ? `${botCount} 位電腦` : "只限真人"}</span>
            <span>不開放觀戰，確認開始後會前往 {game.name} 專屬牌桌。</span>
          </div>

          <button className="confirm-room-button" disabled={!canStartRealOnly} onClick={startGame} type="button">
            <Play size={20} />
            確認房間事項，前往{game.name}
          </button>
        </div>

        <div className="tool-panel" id="join-room">
          <div className="panel-title">
            <Hash />
            <h2>加入房間</h2>
          </div>

          <label>
            玩家暱稱
            <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={12} />
          </label>

          <label>
            六位數房號
            <input
              inputMode="numeric"
              maxLength={6}
              value={roomCode}
              onChange={(event) => setRoomCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </label>

          <div className={`validation ${codeIsValid ? "ok" : "bad"}`}>
            {codeIsValid ? <Check size={18} /> : <Info size={18} />}
            {codeIsValid ? "房號格式正確" : "請輸入六位數房號"}
          </div>

          <div className="rule-callout">
            <Info size={20} />
            私人房間開始後會關閉座位，不允許中途加入，也沒有觀戰模式。
          </div>
        </div>
      </section>

      <section className="room-stage" aria-labelledby="lobby-title">
        <div className="section-heading">
          <p className="stamp">等待室</p>
          <h2 id="lobby-title">{game.name} 房間</h2>
        </div>

        <div className="room-code">
          <span>{roomCode}</span>
          <button onClick={copyCode} type="button" aria-label="複製房號">
            <Copy size={19} />
            {copied ? "已複製" : "複製"}
          </button>
        </div>

        <div className="seat-grid">
          {seats.map((seat, index) => (
            <div className={`seat-card ${seat.type === "邀請中" ? "waiting" : ""}`} key={`${seat.name}-${index}`}>
              <span className="seat-number">座位 {index + 1}</span>
              <strong>{seat.name}</strong>
              <span>{seat.type}</span>
              <em>{seat.ready ? "已準備" : "等待加入"}</em>
            </div>
          ))}
        </div>

        <div className="lobby-actions">
          <label className="ready-toggle">
            <input checked={ready} onChange={(event) => setReady(event.target.checked)} type="checkbox" />
            我的準備狀態
          </label>
          <button className="start-button" disabled={!canStartRealOnly} onClick={startGame} type="button">
            <Play size={20} />
            {canStartRealOnly ? "開始遊戲" : "真人未到齊"}
          </button>
        </div>
      </section>
    </main>
  );
}
