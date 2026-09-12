export type PokerGameId = "big2" | "sevens" | "red-dot" | "ninety-nine" | "liar" | "heart-attack" | "old-maid";

export type ChangeGameMessage = {
  type: "CHANGE_GAME";
  actionId: string;
  gameId: PokerGameId;
  clientId: string;
};

export type GameSwitchedEvent = {
  type: "GAME_SWITCHED";
  gameId: PokerGameId;
  roomId: string;
  roomCode: string;
};
