export type GameId = "big2" | "sevens" | "red-dot" | "ninety-nine" | "liar" | "heart-attack" | "old-maid";

export type Game = {
  id: GameId;
  slug: string;
  name: string;
  players: string;
  min: number;
  max: number;
  bots: boolean;
  realOnly?: boolean;
  note: string;
  status: string;
};

export const games: Game[] = [
  { id: "big2", slug: "big2", name: "大老二", players: "2-4 人", min: 2, max: 4, bots: true, note: "先出完手牌獲勝", status: "規則引擎待開發" },
  { id: "sevens", slug: "sevens", name: "排七", players: "3-5 人", min: 3, max: 5, bots: true, note: "從七開始接龍排牌", status: "規則文件待整理" },
  { id: "red-dot", slug: "red-dot", name: "撿紅點", players: "2-4 人", min: 2, max: 4, bots: true, note: "湊點數、收紅牌", status: "計分流程待開發" },
  { id: "ninety-nine", slug: "ninety-nine", name: "九九", players: "2-6 人", min: 2, max: 6, bots: true, note: "累計點數別爆掉", status: "前端牌桌互動中" },
  { id: "liar", slug: "liar", name: "吹牛", players: "3-6 人", min: 3, max: 6, bots: true, note: "判斷誰在唬爛", status: "喊牌與質疑流程待開發" },
  { id: "heart-attack", slug: "heart-attack", name: "心臟病", players: "3-6 人", min: 3, max: 6, bots: false, realOnly: true, note: "只限真人反應拍牌", status: "公平延遲判定待開發" },
  { id: "old-maid", slug: "old-maid", name: "抽鬼牌", players: "3-6 人", min: 3, max: 6, bots: false, realOnly: true, note: "只限真人玩家", status: "真人邀請流程待完成" }
];

export function getGame(id: GameId) {
  return games.find((game) => game.id === id) ?? games[3];
}
