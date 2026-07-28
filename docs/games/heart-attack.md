# 心臟病平台標準規則

本文件以「自動出牌模式」為平台標準。此修正版優先於舊版心臟病規則文件。

## 核心模式

- 玩家不需要點擊牌堆。
- 玩家不需要手動翻牌。
- 玩家沒有「出牌」、「翻牌」、「Pass」或整理手牌操作。
- 系統會依座位順序自動替目前玩家翻出最上方一張牌。
- 玩家唯一主要操作是「拍！」。

自動出牌間隔：

```ts
const AUTO_PLAY_INTERVAL_MS = 800;
```

每 0.8 秒，若牌局處於 playing 階段且沒有暫停，系統自動翻出目前玩家的一張牌。

## 玩家順序

系統依座位順序循環：

```text
玩家 1 -> 玩家 2 -> 玩家 3 -> 玩家 4 -> 玩家 1
```

若玩家已進入 pendingFinish，系統不會再替該玩家翻牌。當回合安全回到 pendingFinish 玩家時，該玩家獲勝。

## 牌組與發牌

- 使用含鬼牌牌組。
- 每副牌 52 張標準牌加 2 張鬼牌，共 54 張。
- 每位玩家起手 20 張。
- 系統依玩家數自動計算需要幾副牌。

```ts
const cardsNeeded = playerCount * 20;
const deckCount = Math.ceil(cardsNeeded / 54);
```

## 喊數

喊數從 1 到 13 循環：

```text
1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1...
```

對應牌面：

| 喊數 | 牌面 |
| --- | --- |
| 1 | A |
| 2-10 | 同數字牌 |
| 11 | J |
| 12 | Q |
| 13 | K |

鬼牌不觸發拍牌。

## 拍牌窗口

若系統翻出的牌面與當下喊數相同，牌局進入 slap-window。

```ts
const SLAP_WINDOW_MS = 1500;
```

slap-window 期間：

- 自動出牌暫停。
- 玩家可以按「拍！」送出 SLAP action。
- 最早的有效拍牌者收走中央牌堆。
- 若沒有人在時間內拍牌，翻出觸發牌的玩家收走中央牌堆。

## Round Result

拍牌結果會顯示一小段時間，期間不自動翻下一張牌。

```ts
const ROUND_RESULT_DISPLAY_MS = 1200;
```

顯示結束後，系統回到 playing，並重新排定下一次自動出牌。

## Action 模型

玩家 action 只允許：

```ts
type HeartAttackPlayerAction = {
  type: "SLAP";
  playerId: string;
  timestamp: number;
};
```

系統 action：

```ts
type HeartAttackSystemAction = {
  type: "AUTO_PLAY_TICK";
  timestamp: number;
};
```

舊版玩家 `PLAY_TOP_CARD` 不再合法。

## 引擎狀態

心臟病狀態包含自動出牌欄位：

```ts
interface HeartAttackState {
  autoPlayIntervalMs: number;
  nextAutoPlayAt: number | null;
  isAutoPlayPaused: boolean;
}
```

規則引擎不使用 `setInterval()`、DOM 或 React。外部伺服器或前端以排程呼叫 `advanceAutoPlay(state, timestamp)`。

## pendingFinish

玩家出完最後一張牌後進入 pendingFinish。

- pendingFinish 玩家不再自動翻牌。
- 如果玩家在 pendingFinish 後因錯拍或懲罰收回中央牌堆，仍可能回到遊戲。
- 如果回合安全回到 pendingFinish 玩家，該玩家獲勝。

## 目前不包含

- WebSocket
- Colyseus
- Socket.IO
- Firebase
- 伺服器延遲校正
- 正式多人同步
- 手動翻牌 UI

## ?��??�罰警示

心�??�自?�出?�模式新增統一?�收?��?罰�???`PenaltyResult`?�當?��?誤�??��??��???��?�後�?位�?桌、�??�人?�到，�? `pendingFinish` ?�家?�後失?��?，系統�?建�??�罰結�?並進入 `round-result`??
```ts
type PenaltyReason =
  | "false-slap"
  | "slowest-slap"
  | "no-slap"
  | "pending-finish-failed";

interface PenaltyResult {
  reason: PenaltyReason;
  playerId: string;
  playerName: string;
  cardsTaken: number;
  cardIds: string[];
  responseTimeMs: number | null;
  occurredAt: number;
}
```

`cardsTaken` 必�?等於?�罰?��?中央?��?張數，`cardIds` 必�?完整?�出被移?��?中央?�。警示顯示�??�使??`PENALTY_ALERT_MS = 1800`，自?�出?�暫?��??�家也�?得送出?��? `SLAP`?�警示�??��??��???`playing` 並�??��?程�?一次自?�翻?��?

## 多人後端權�?規�?

心�??��?人�??�由 Colyseus Room ?�任權�??�?��?源。�?端�?得自行翻?��?決�??��?結�?，只?�送出 `SLAP` 類�??�玩家�?作�?
- 伺�??��?�?800ms ?��?翻出?��??�家?��??��?- 伺�??�建�?`slap-window` ??`slapDeadline`??- ?�家?��?`SLAP`，並?�伺?�器?��?計�??��??��???- `round-result` ??`finished` ?�段不接?�新?��?桌�?- ?��??�罰?�伺?�器建�? `PenaltyResult` / `PenaltyNotice`??- ?�家?��??��??�、發?�、�??�移?��??��??��??��??�在伺�??��?- ?��??�步?��??�剩餘張?�、�?一張�??�中央�??�張?�、目?��??�、�?段、deadline ?��?罰�?示�?
?��?段�?使用 Firebase?�Firestore?�Redis ?�任何儲??下注?��?系統??
