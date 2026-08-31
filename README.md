# 鬥陣來一局

台灣常見撲克牌玩法的純娛樂線上房原型。專案目前包含 Next.js 前端、共用 TypeScript 規則引擎，以及心臟病、九九 Colyseus 多人後端第一版。

## Scripts

```bash
npm run dev
npm run dev:server
npm test
npm run build
```

Frontend:

```bash
npm run dev
```

Game server:

```bash
npm run dev:server
```

Default game server URL:

```env
NEXT_PUBLIC_GAME_SERVER_URL=ws://localhost:2567
```

目前多人牌局狀態保存在 Colyseus Room 記憶體，不使用資料庫。

## Heart Attack Backend

- Colyseus room: `heart_attack`
- Server entry: `server/index.ts`
- Room: `server/rooms/HeartAttackRoom.ts`
- Public schema: `server/schema/HeartAttackRoomState.ts`
- Messages: `server/messages/heartAttackMessages.ts`
- Backend docs: `docs/backend/heart-attack-server.md`

The Heart Attack backend is server authoritative. The server flips cards automatically, owns slap-window timing, resolves penalties, and never accepts client-side manual card flipping.

Hidden hands stay in the engine/room state and are not published through the public room schema.

## Ninety-Nine Backend

- Colyseus room: `ninety_nine`
- Game page: `app/games/ninety-nine/page.tsx`
- Rules: `docs/games/ninety-nine.md`
- Engine: `lib/games/ninety-nine`
- Room: `server/rooms/NinetyNineRoom.ts`
- Public schema: `server/schema/NinetyNineRoomState.ts`
- Messages: `server/messages/ninetyNineMessages.ts`
- Backend docs: `docs/backend/ninety-nine-server.md`

The Ninety-Nine backend is server authoritative. The server owns hidden hands, legal actions, total changes, drawing, discard recycling, turn order, bot actions, timeout actions, elimination, and winner resolution.

## Pick Red Points Backend

- Colyseus room: `pick_red_points`
- Game page: `app/games/red-dot/page.tsx`
- Rules: `docs/games/pick-red-points.md`
- Engine: `lib/games/pick-red-points`
- Room: `server/rooms/PickRedPointsRoom.ts`
- Public schema: `server/schema/PickRedPointsRoomState.ts`

撿紅點使用伺服器權威配對與計分，公開狀態只提供桌牌、分數、剩餘手牌數與抽牌堆張數；完整手牌只透過個人事件傳送。

## Sevens Rules Engine

- Game page: `app/games/sevens/page.tsx`
- Rules: `docs/games/sevens.md`
- Engine: `lib/games/sevens`
- Tests: `tests/sevens/engine.test.ts`

排七目前提供經典四人與雙副牌競速兩種本機前端示範模式。獨立 TypeScript 引擎負責洗牌、發牌、首位玩家、合法出牌、蓋牌限制、回合方向、計分、排名及電腦玩家動作；前端只透過規則引擎提交動作。正式多人版本仍需將相同引擎接到伺服器權威房間。
