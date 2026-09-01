export const PICK_RED_MIN_PLAYERS = 2;
export const PICK_RED_MAX_PLAYERS = 4;
export const TARGET_SELECTION_MS = 12_000;
export const PICK_RED_TURN_DURATION_MS = 30_000;
export const PICK_RED_RECONNECT_WINDOW_SECONDS = 60;
export const BLACK_HAND_REVEAL_MS = 3_000;
/** 正式開局前，讓尾家查看整副牌最底下一張牌的時間。 */
export const PICK_RED_BOTTOM_CARD_CONFIRM_MS = 5_000;
/** 手牌完成配對或落桌後，停留多久才翻牌。 */
export const PICK_RED_BEFORE_DRAW_MS = 700;
/** 翻牌正面展示多久，才自動配對、落桌或開放選擇。 */
export const PICK_RED_DRAW_REVEAL_MS = 900;
/** 電腦輪到出手牌前的思考停留時間。 */
export const PICK_RED_BOT_PLAY_DELAY_MS = 900;
/** 電腦面對多個配對目標時，選牌前的停留時間。 */
export const PICK_RED_BOT_TARGET_DELAY_MS = 700;
