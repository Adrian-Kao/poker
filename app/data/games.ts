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
  { id: "big2", slug: "big2", name: "大老二", players: "2-4 人", min: 2, max: 4, bots: true, note: "台灣常見出牌玩法", status: "規則整理中" },
  { id: "sevens", slug: "sevens", name: "排七", players: "3-5 人", min: 3, max: 5, bots: true, note: "接龍式排牌", status: "規則整理中" },
  { id: "red-dot", slug: "red-dot", name: "撿紅點", players: "2-4 人", min: 2, max: 4, bots: true, note: "紅牌計分對戰", status: "規則整理中" },
  { id: "ninety-nine", slug: "ninety-nine", name: "九九", players: "2-6 人", min: 2, max: 6, bots: true, note: "累積點數到 99", status: "前端互動原型" },
  { id: "liar", slug: "liar", name: "吹牛", players: "3-6 人", min: 3, max: 6, bots: true, note: "喊牌與質疑", status: "規則整理中" },
  { id: "heart-attack", slug: "heart-attack", name: "心臟病", players: "2-6 人", min: 2, max: 6, bots: false, realOnly: true, note: "只限真人遊玩", status: "多人連線原型" },
  { id: "old-maid", slug: "old-maid", name: "抽鬼牌", players: "3-6 人", min: 3, max: 6, bots: false, realOnly: true, note: "只限真人玩家", status: "規則整理中" }
];

export function getGame(id: GameId) {
  return games.find((game) => game.id === id) ?? games[3];
}
