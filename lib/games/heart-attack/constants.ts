export const HEART_ATTACK_CALL_MAX = 13;
export const SLAP_WINDOW_MS = 1500;
export const AUTO_PLAY_INTERVAL_MS = 900;
export const PENALTY_ALERT_MS = 5000;
export const ROUND_RESULT_DISPLAY_MS = PENALTY_ALERT_MS;
export const RESULT_NOTICE_MS = PENALTY_ALERT_MS;
export const RECONNECT_WINDOW_SECONDS = 30;

export const botSettings = {
  easy: {
    minReactionMs: 900,
    maxReactionMs: 1400,
    missChance: 0.18,
    falseSlapChance: 0.08
  },
  normal: {
    minReactionMs: 550,
    maxReactionMs: 1000,
    missChance: 0.08,
    falseSlapChance: 0.04
  },
  hard: {
    minReactionMs: 300,
    maxReactionMs: 700,
    missChance: 0.03,
    falseSlapChance: 0.02
  }
} as const;
