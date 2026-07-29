# 九九多人後端

## 位置

- 規則引擎：`lib/games/ninety-nine`
- Room：`server/rooms/NinetyNineRoom.ts`
- 公開狀態：`server/schema/NinetyNineRoomState.ts`
- 訊息契約：`server/messages/ninetyNineMessages.ts`
- Room 註冊：`server/app.config.ts` 的 `ninety_nine`

## 房間生命週期

建立房間時由伺服器產生六位數房號，並透過 Colyseus metadata/filterBy 支援房號加入。等待室支援 2 至 6 位玩家，房主可以加入或移除 bot。所有真人玩家準備、bot 自動準備後，房主可以開始遊戲。開始後 Room 會 lock，不允許陌生玩家中途加入。

## 私有手牌與公開狀態

完整 `NinetyNineState` 保存在 Room controller 私有欄位，不放入 Colyseus Schema。公開 Schema 只包含玩家、座位、手牌張數、中央點數、方向、目前玩家、倒數、最近公開牌、抽牌堆與棄牌堆張數、勝利者等可見資訊。

每位真人的完整手牌與合法動作透過 `HAND_UPDATED` 私訊傳送給該玩家，不廣播給其他人。

## Client 訊息

- `SET_READY`
- `START_GAME`
- `ADD_BOT`
- `REMOVE_BOT`
- `PLAY_CARD`
- `PLAY_AGAIN`
- `CLOSE_ROOM`

`PLAY_CARD` 只接受 `cardId` 與完整 `choice`。Room 會用連線 session 對應真實玩家，不信任前端提供的 `playerId`、點數、下一位、抽牌或勝負資訊。

## Server 事件

- `GAME_STARTED`
- `CARD_PLAYED`
- `HAND_UPDATED`
- `TURN_CHANGED`
- `PLAYER_ELIMINATED`
- `GAME_FINISHED`
- `ROOM_CLOSED`
- `ACTION_REJECTED`

## 回合計時

每回合使用 `TURN_DURATION_MS = 30000`。Room 會建立 turn token 並排程 timeout。合法出牌、bot 出牌或遊戲結束會清除舊 timer，避免舊回合動作影響新回合。

真人逾時時，伺服器以固定可測試規則選擇第一個合法動作代為出牌；若沒有合法動作，呼叫規則引擎出局流程。

## Bot

bot 決策在 `lib/games/ninety-nine/bots.ts`。簡單難度隨機選合法動作，普通與困難會偏好降低高點數風險、保留安全效果、並在 5 指定玩家時考慮公開可見的手牌張數。bot 不讀取真人玩家隱藏手牌。

## 牌堆回收

出牌後補牌時若抽牌堆為空，規則引擎會保留最近一張公開牌，將其餘棄牌重新洗牌成抽牌堆。所有洗牌支援注入亂數來源，方便測試。

## 斷線重連

Room 沿用 Colyseus `allowReconnection`，保留座位 30 秒。重連後會恢復連線狀態並重新傳送該玩家自己的手牌與合法動作。若輪到離線玩家，伺服器仍照常倒數並在逾時後代為處理。

## 本機測試

```bash
npm run dev
npm run dev:server
npm test
npm run build
```

預設前端連線：

```env
NEXT_PUBLIC_GAME_SERVER_URL=ws://localhost:2567
```

