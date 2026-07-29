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

