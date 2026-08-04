# 大老二多人後端

Colyseus room type：`big_two`。

## 等候室

- 建立房間時產生六位數房號，房號存於 metadata 供 `joinById`／`joinOrCreate` 篩選。
- 支援 3 或 4 個座位、真人準備、房主開始、加入與移除電腦玩家。
- `clientId` 採分頁級 `sessionStorage` 身分，同一分頁重新連線會更新原座位，不會新增重複玩家。

## 玩家訊息

- `SET_READY`
- `START_GAME`
- `ADD_BOT`
- `REMOVE_BOT`
- `PLAY_CARDS`
- `PASS`
- `REQUEST_STATE`
- `PLAY_AGAIN`
- `CLOSE_ROOM`

## 私有資料

公開 schema 不包含任何玩家完整手牌。伺服器透過 `big-two:event` 的 `PRIVATE_HAND` 事件定向傳送手牌給擁有者。

## 權威判定

所有出牌都由 `lib/games/big-two` 驗證牌權、牌型、大小、梅花 3 首出限制與重複 action id。每回合由伺服器建立 30 秒 deadline，逾時也由伺服器執行合法動作。
