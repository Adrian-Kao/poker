# 鬥陣來一局｜台灣撲克牌線上房

這是一個以台灣常見撲克牌玩法為核心的純娛樂多人遊戲前端原型。

## 產品邊界

- 不需要註冊即可建立或加入私人房間。
- 房間使用六位數房號邀請朋友。
- 開局後房間關閉，不允許中途加入。
- 不提供觀戰功能。
- 不提供下注、儲值、商城、籌碼、金幣、輪盤或娛樂城式設計。
- 抽鬼牌只允許真人玩家，不提供電腦玩家。
- 電腦玩家不可讀取真人玩家的隱藏手牌。

## 開發順序

1. 共用房間、座位與同步系統。
2. 以「九九」完成第一款可玩的端到端遊戲。
3. 依序擴充大老二、排七、撿紅點、吹牛、心臟病、抽鬼牌。

## 技術方向

- Next.js
- React
- TypeScript
- Tailwind CSS / CSS utilities
- 後續遊戲伺服器建議使用 Node.js、Colyseus 與 WebSocket。
- Firestore 只儲存帳號、設定、紀錄與統計，不作為牌局權威狀態。

## 目前狀態

此版本是可操作的前端體驗原型，尚未包含真正多人連線、洗牌發牌、規則引擎、合法動作判定、計分或勝負判定。

## 九九規則文件與引擎

- 平台標準規則文件：`docs/games/ninety-nine.md`
- 純 TypeScript 規則引擎：`lib/games/ninety-nine/`
- 共用撲克牌與洗牌工具：`lib/games/core/`
- 測試：`tests/ninety-nine/`

九九規則引擎不依賴 React、Next.js、DOM、WebSocket、Firestore 或任何 UI 狀態。洗牌支援注入亂數來源，伺服器之後可以用固定 seed 重現牌局。

目前已提供：

- 52 張標準牌建立與可重現洗牌。
- 建立九九牌局並發給每位玩家 5 張手牌。
- A、4、5、10、J、Q、K 與一般點數牌的合法動作判定。
- 出牌後更新累積點數、棄牌堆、補牌、方向、下一位玩家。
- 無合法動作玩家出局。
- 只剩一位玩家時結束牌局並記錄勝者。

執行測試：

```bash
npm test
```

## 心臟病規則文件、引擎與原型

- 平台標準規則文件：`docs/games/heart-attack.md`
- 純 TypeScript 規則引擎：`lib/games/heart-attack/`
- 測試：`tests/heart-attack/`
- 可操作牌桌：`/games/heart-attack`

心臟病正式多人房間定位為只限真人玩家。此階段的牌桌使用 React state 做本機互動原型，展示翻牌、喊數、拍牌窗口、錯拍、電腦反應設定與 pendingFinish 流程；正式公平判定仍需要後續伺服器權威時間校正。

心臟病引擎不依賴 React、Next.js、DOM、WebSocket 或 Firestore。所有行動時間由 action 傳入，避免在規則引擎中直接使用本機時間。

## 心�??�自?�出?�模�?
- 標�?規�??�件：`docs/games/heart-attack.md`
- ?��? TypeScript 規�?引�?：`lib/games/heart-attack/`
- 測試：`tests/heart-attack/`
- ?��?作�?示�?：`/games/heart-attack`

心�??�目?�採?�自?�出?�模式�?系統�?0.8 秒�?座�??��??��?翻出?��??�家?��??��??�家?��?主�??��??�「�?！」。�?端�??�只??React state 展示互�?節奏�?�??多人?�本必�??�伺?�器權�??��??�叫 `advanceAutoPlay`，�?得接?��?端�??�翻?��??��??��???
引�?不使??`setInterval`，只?��?純�???action�?
- ?�家 action：`{ type: "SLAP", playerId, timestamp }`
- 系統 action：`{ type: "AUTO_PLAY_TICK", timestamp }`

`PLAY_TOP_CARD` 不�??��?法玩家�?作。自?�翻?�只?�在 `playing` ?�段且�??�到??`nextAutoPlayAt` 後推?��?`slap-window`?�`round-result` ??`finished` ?�段?��??�自?�翻?��?
