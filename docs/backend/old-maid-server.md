# 抽鬼牌多人後端

本文件定義抽鬼牌的 Colyseus 通訊、隱私、逾時與斷線政策。遊戲規則以 [`docs/games/old-maid.md`](../games/old-maid.md) 為準；本文件只補充多人後端行為。

## 位置與房間

- 規則引擎：`lib/games/old-maid`
- Room：`server/rooms/OldMaidRoom.ts`
- 公開狀態：`server/schema/OldMaidRoomState.ts`
- 訊息契約：`server/messages/oldMaidMessages.ts`
- Colyseus 房間名稱：`old_maid`
- Server 事件頻道：`old-maid:event`

Room 只保存在記憶體，不使用資料庫。每房支援 3 至 6 位真人玩家，不支援 bot。建立房間時產生六位數房號，透過 `roomCode` metadata 與 `filterBy` 加入；開始遊戲後 Room 會 lock，只允許原玩家重連。

## Client 訊息

所有訊息都必須包含非空白且在該 Room 生命週期內唯一的 `actionId`。

| 訊息 | Payload | 限制 |
| --- | --- | --- |
| `SET_READY` | `{ type, actionId, ready: boolean }` | 僅等待室玩家 |
| `START_GAME` | `{ type, actionId }` | 僅房主；所有玩家已連線且準備完成 |
| `DRAW_CARD` | `{ type, actionId, turnNumber, cardSlotId }` | 僅目前玩家 |
| `PLAY_AGAIN` | `{ type, actionId }` | 僅房主；牌局已結束 |
| `CLOSE_ROOM` | `{ type, actionId }` | 僅房主 |

Client 不傳送可信任的 `playerId`、`targetPlayerId`、牌面、下一位玩家或勝負結果。Room 由 `client.sessionId` 解析行動玩家，並由規則引擎計算唯一合法的抽牌對象。規則文件中 `DRAW_CARD` 的 `playerId` 與 `targetPlayerId` 是 Room 建立的內部引擎 action，不是 Client 輸入。

## Server 事件

| 事件 | Payload | 接收者 |
| --- | --- | --- |
| `GAME_STARTED` | `{ type }` | 全房；代表洗牌流程開始 |
| `HAND_UPDATED` | `{ type, turnNumber, cards }` | 該手牌擁有者 |
| `DRAW_OPTIONS_UPDATED` | `{ type, turnNumber, targetPlayerId, cardSlotIds }` | 目前玩家 |
| `CARD_DRAWN` | `{ type, playerId, targetPlayerId, system }` | 全房 |
| `PAIRS_REMOVED` | `{ type, playerId, ranks }` | 全房 |
| `TURN_CHANGED` | `{ type, playerId, targetPlayerId, turnNumber, deadline }` | 全房 |
| `PLAYER_SAFE` | `{ type, playerId, finishOrder }` | 全房 |
| `GAME_FINISHED` | `{ type, loserId }` | 全房 |
| `ROOM_CLOSED` | `{ type, reason: "left" \| "cancelled" }` | 全房 |
| `ACTION_REJECTED` | `{ type, actionId?, reason }` | 被拒絕的 Client |

`CARD_DRAWN` 不公開抽到的牌。抽牌玩家只會透過自己的 `HAND_UPDATED` 看見牌面。被抽牌者看到真實牌面，抽牌者只看到相同排列順序的牌背。`PAIRS_REMOVED.ranks` 可以公開已移除配對的點數，但不得附帶其餘手牌或鬼牌位置。

開局的 `HAND_UPDATED` 使用 `turnNumber: 0`：`revealing` 先向擁有者傳送完整原始手牌，`organizing` 每移除一輪配對便向受影響的擁有者重送手牌。開局的 `PAIRS_REMOVED` 每位玩家每輪最多包含一個點數，讓其他玩家只更新公開張數與配對點數。

## 公開 Schema

`OldMaidRoomStateSchema` 只同步所有玩家都能知道的資料：

- `roomCode`
- `phase`：`waiting`、`shuffling`、`dealing`、`revealing`、`organizing`、`ready`、`playing` 或 `finished`
- `maxPlayers`
- `round`
- `dealerPlayerId`
- `currentPlayerId`
- `targetPlayerId`
- `turnNumber`
- `turnDeadline`
- `phaseStartedAt`
- `phaseDeadline`
- `loserId`
- `players`

每位公開玩家只包含：

- `id`
- `nickname`
- `seat`
- `status`：`waiting`、`playing`、`safe` 或 `loser`
- `connected`
- `ready`
- `cardsRemaining`
- `host`

公開 Schema 不得包含完整手牌、牌面、鬼牌位置、`cardSlotId` 對應、`sessionId` 或 `actionId`。

`phaseStartedAt` 與 `phaseDeadline` 均為伺服器毫秒時間戳。開局期間固定使用 `turnNumber = 0` 與 `turnDeadline = 0`，也不公開 `currentPlayerId` 或 `targetPlayerId`。`shuffling` 與 `dealing` 的公開手牌張數為 `0`；進入 `revealing` 後才同步實際張數。

## 私人資料與隱藏牌位

完整遊戲狀態、每位玩家的手牌及 `sessionId` 對應只保存在 Room controller。

每回合開始時，伺服器將抽牌對象的手牌洗牌一次，建立只在該 `turnNumber` 有效的展示順序。每個位置包含一組 `{ cardSlotId, cardId }` 私人對應。

- 被抽牌者收到 `HAND_UPDATED`，依展示順序看見自己的真實牌面。
- 抽牌者收到 `DRAW_OPTIONS_UPDATED`，依相同展示順序看見 `cardSlotId` 對應的牌背。
- 兩個陣列的相同索引代表同一張實體牌，但只有被抽牌者與伺服器知道牌面。
- 兩端前端必須依伺服器順序顯示，不得自行依點數、花色或原有手牌順序排序。
- 展示順序在該回合內鎖定，不提供拖曳、重新排列或相關 Client 訊息。

`cardSlotId` 不得包含陣列索引、牌面、花色或真實 `cardId`。成功抽牌、回合變更或牌局結束後，展示順序與舊對應立即失效。未參與當次抽牌的玩家不接收 `cardSlotId`，中央也不顯示牌背、牌面或牌數；只顯示「抽牌者頭像 → 被抽牌者頭像」及等待文字。公開剩餘張數仍可由上方玩家卡片查看。

## 開局同步流程

規則引擎提供開局建立介面，同一次亂數流程會回傳原始發牌手牌、每位玩家依序要移除的配對，以及整理後可直接進入正式回合的遊戲狀態。既有 `createOldMaidGame` 仍回傳正式遊戲狀態，維持相容。

Room 依序建立單次 timer，不允許 Client 跳過階段：

1. `shuffling`：中央牌堆洗牌 `1600 ms`。
2. `dealing`：每 `80 ms` 發出一張牌，`54` 張共 `4320 ms`；發牌順序從莊家後一席開始輪流分配。
3. `revealing`：所有玩家查看自己的完整正面手牌 `1000 ms`。
4. `organizing`：每 `500 ms`，每位玩家同時最多移除一組配對；四張同點數會分兩輪，兩張鬼牌永不配對。即使沒有任何起始配對，仍保留一個 `500 ms` 整理階段。
5. `ready`：最上層顯示「整理手牌完畢，遊戲開始」`1500 ms`。
6. 提示結束後才切換至 `playing`、發送第一個 `TURN_CHANGED` 並啟動 `30000 ms` 回合倒數。

開局期間的 `DRAW_CARD` 一律拒絕。若整理後遊戲已直接結束，`ready` 完成後直接切換至 `finished` 並發布結果，不建立回合 timer。

## `actionId` 去重

- Room 在處理每個 Client 訊息前先檢查 `actionId`。
- 缺少或重複的 `actionId` 會收到 `ACTION_REJECTED`，且不得改變狀態。
- `actionId` 一旦收到就視為已使用；即使動作後續因回合或權限錯誤被拒絕，也不能重用。
- 已使用的 `actionId` 保留到 Room 關閉，不因 `PLAY_AGAIN` 清除，以阻擋上一局延遲抵達的封包。
- `actionId` 只負責去重，不代表玩家身分或權限。

`DRAW_CARD` 還必須同時符合目前 `turnNumber` 與有效的 `cardSlotId`；任一不符都拒絕。

## 回合逾時

- `TURN_DURATION_MS = 30000`。
- `turnDeadline` 使用伺服器毫秒時間戳。
- 每回合建立新的 turn token 與單次 timeout，不使用 `setInterval`。
- 合法抽牌、牌局結束、重新開局或 Room dispose 時必須清除舊 timer。
- timeout 執行前再次驗證 turn token、`turnNumber`、目前玩家與抽牌對象，確保一回合最多成功抽一張牌。

玩家逾時時，伺服器使用可注入的亂數來源，從當回合有效的隱藏牌位中等機率抽取一張，並將 `CARD_DRAWN.system` 設為 `true`。不論玩家仍在線上或已斷線，逾時政策相同。

## 斷線與重連

非主動斷線使用 Colyseus `allowReconnection`，重連期限為 `RECONNECT_WINDOW_SECONDS = 30`。

- 斷線時將玩家的公開 `connected` 設為 `false`，但手牌仍只保留在伺服器。
- 牌局與回合倒數不暫停，也不因重連重新計時。
- 玩家在期限內重連時恢復原身分，伺服器只重送該玩家的 `HAND_UPDATED`；若正輪到該玩家，再重送當回合的 `DRAW_OPTIONS_UPDATED`。
- 玩家在開局階段重連時，不重設 `phaseStartedAt` 或 `phaseDeadline`，也不重播已完成階段；`revealing`、`organizing` 或 `ready` 只重送該玩家當下的 `HAND_UPDATED`，`shuffling` 與 `dealing` 不提前傳送私人手牌。
- 等待室玩家超過期限未重連時移除座位；若為房主，房主交給座位最前的已連線玩家。
- 遊戲中的玩家超過期限未重連時保留手牌並維持 `connected = false`；輪到該玩家時由逾時政策代抽，直到成為 `safe` 或 `loser`。
- 主動離線不提供 30 秒重連等待：等待室立即移除；遊戲中直接套用永久斷線政策。
- 若沒有任何已連線玩家，Room 立即關閉並清除 timer。

重新連線不會取得其他玩家手牌、舊的隱藏牌位對應或已使用的 `actionId`。

## 重新開局與關房

`PLAY_AGAIN` 會清除開局與回合 timer、移除永久斷線玩家、清空牌局狀態、增加 `round`，並讓其餘玩家回到未準備的等待室。房主送出 `CLOSE_ROOM`、所有玩家永久離線或 Room dispose 時，也必須清除所有開局與回合 timer。
