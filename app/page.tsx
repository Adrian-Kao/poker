"use client";

import { Bot, Check, DoorOpen, Hash, Info, Play, Plus, ShieldCheck, Users, X } from "lucide-react";
import { useState } from "react";
import { games, type Game } from "./data/games";

const difficultyOptions = ["簡單", "普通", "困難"];
const serverBackedGames = new Set(["heart-attack", "ninety-nine", "liar"]);

export default function Home() {
  const [selectedGameId, setSelectedGameId] = useState("ninety-nine");
  const [nickname, setNickname] = useState("阿德");
  const [joinCode, setJoinCode] = useState("");
  const [targetPlayers, setTargetPlayers] = useState(4);
  const [botCount, setBotCount] = useState(1);
  const [difficulty, setDifficulty] = useState("普通");

  const game = games.find((item) => item.id === selectedGameId) ?? games[3];
  const humanPlayers = Math.max(1, targetPlayers - (game.bots ? botCount : 0));
  const canCreate = !game.realOnly || humanPlayers >= targetPlayers;
  const codeIsValid = /^\d{6}$/.test(joinCode);
  const joinGame = serverBackedGames.has(game.slug) ? game : games.find((item) => item.id === "heart-attack") ?? game;

  function selectGame(nextGame: Game) {
    setSelectedGameId(nextGame.id);
    setTargetPlayers(Math.min(Math.max(targetPlayers, nextGame.min), nextGame.max));
    if (!nextGame.bots) setBotCount(0);
  }

  function createRoom() {
    if (!canCreate) return;
    const params = new URLSearchParams({
      mode: "create",
      name: nickname || "玩家",
      players: String(targetPlayers),
      bots: String(game.bots ? botCount : 0),
      difficulty
    });
    window.location.href = `/games/${game.slug}?${params.toString()}`;
  }

  function joinRoom() {
    if (!codeIsValid) return;
    const params = new URLSearchParams({
      mode: "join",
      room: joinCode,
      name: nickname || "玩家"
    });
    window.location.href = `/games/${joinGame.slug}?${params.toString()}`;
  }

  return (
    <main className="site-shell">
      <section className="hero-grid" aria-labelledby="site-title">
        <div className="hero-copy">
          <p className="stamp">朋友撲克房</p>
          <h1 id="site-title">來玩牌阿!</h1>
          <p className="hero-text">輸入暱稱就能建立私人房間，用六位數房號邀請朋友加入。</p>
          <div className="hero-actions" aria-label="主要操作">
            <a className="primary-action" href="#create-room">
              <Plus size={22} />
              建立房間
            </a>
            <a className="secondary-action" href="#join-room">
              <Hash size={22} />
              加入房間
            </a>
          </div>
        </div>

        <div className="poster" aria-label="朋友撲克牌插圖">
          <div className="poster-sun">純娛樂</div>
          <div className="table-scene">
            <span className="card-chip blue">排七</span>
            <span className="card-chip yellow">九九</span>
            <span className="card-chip cream">心臟病</span>
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
          純娛樂，沒有下注、儲值或籌碼設計
        </div>
        <div>
          <DoorOpen />
          私人房間開局後關閉，不允許中途加入
        </div>
        <div>
          <Bot />
          支援補位的遊戲才會顯示電腦玩家
        </div>
      </section>

      <section className="section-block" aria-labelledby="games-title">
        <div className="section-heading">
          <p className="stamp">七款遊戲</p>
          <h2 id="games-title">先選今天要玩的牌局</h2>
        </div>
        <div className="game-grid">
          {games.map((item) => (
            <button className={`game-card ${item.id === game.id ? "active" : ""}`} key={item.id} onClick={() => selectGame(item)} type="button">
              <span className="game-name">{item.name}</span>
              <span className="game-players">
                <Users size={17} />
                {item.players}
              </span>
              <span className="game-note">{item.note}</span>
              {item.realOnly && <strong className="real-only">只限真人遊玩</strong>}
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
            <input type="range" min={game.min} max={game.max} value={targetPlayers} onChange={(event) => setTargetPlayers(Number(event.target.value))} />
            <span className="range-value">{targetPlayers} 人</span>
          </label>

          {game.bots ? (
            <>
              <label>
                電腦玩家
                <input type="range" min={0} max={Math.max(0, targetPlayers - 1)} value={botCount} onChange={(event) => setBotCount(Number(event.target.value))} />
                <span className="range-value">{botCount} 位</span>
              </label>
              <div className="segmented" aria-label="電腦難度">
                {difficultyOptions.map((level) => (
                  <button className={difficulty === level ? "selected" : ""} key={level} onClick={() => setDifficulty(level)} type="button">
                    {level}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="rule-callout strong">
              <X size={20} />
              {game.name} 只開放真人玩家，不會顯示電腦補位選項。
            </div>
          )}

          <div className="summary-box">
            <strong>{game.name}</strong>
            <span>
              {targetPlayers} 人房，目前設定 {humanPlayers} 位真人{game.bots ? `、${botCount} 位電腦` : "。"}
            </span>
            <span>房號會由伺服器自動產生六位數，建立後直接進入等待室。</span>
          </div>

          <button className="confirm-room-button" disabled={!canCreate} onClick={createRoom} type="button">
            <Play size={20} />
            確認房間事項，前往等待室
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
            <input inputMode="numeric" maxLength={6} value={joinCode} onChange={(event) => setJoinCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
          </label>

          <div className={`validation ${codeIsValid ? "ok" : "bad"}`}>
            {codeIsValid ? <Check size={18} /> : <Info size={18} />}
            {codeIsValid ? "房號格式正確" : "請輸入六位數房號"}
          </div>

          <div className="rule-callout">
            <Info size={20} />
            目前請先選擇要加入的遊戲類型，再輸入該遊戲的六位數房號。
          </div>

          <button className="confirm-room-button" disabled={!codeIsValid} onClick={joinRoom} type="button">
            <Hash size={20} />
            加入 {joinGame.name} 房間
          </button>
        </div>
      </section>
    </main>
  );
}
