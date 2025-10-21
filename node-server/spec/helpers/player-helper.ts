import { Player } from "../../src/models/player.model";
import { PlayerCollection } from "../../src/player-collection";

export const createPlayer = (name: string | null = null) => {
  let names = [
    "bob",
    "alice",
    "dave",
    "charlie",
    "eve",
    "frank",
    "grace",
    "henry",
  ];
  if (name === null) {
    name = names[Math.floor(Math.random() * names.length)];
  }
  return new Player(name);
};

export const createPlayerCollection = (
  withPlayer: boolean = false
): [PlayerCollection, Player | null] => {
  var player: Player | null = null;
  let collection = new PlayerCollection();
  if (withPlayer) {
    player = createPlayer();
    collection.register(player);
  }
  return [collection, player];
};
