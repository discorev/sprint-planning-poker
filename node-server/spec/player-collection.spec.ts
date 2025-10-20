import { describe, it, expect } from "vitest";
import { createPlayer, createPlayerCollection } from "./helpers/player-helper";

describe("Player collection", function () {
  it("should allow a user to register when the collection is empty", () => {
    let [playerCollection, _] = createPlayerCollection();
    let player = createPlayer();
    expect(playerCollection.register(player)).toBe(true);
  });

  it("should allow a user to register when the collection is empty", () => {
    let [playerCollection, _] = createPlayerCollection(true);
    let player = createPlayer("steve");
    expect(playerCollection.register(player)).toBe(true);
  });

  it("should only allow a user to register once", () => {
    let [playerCollection, player] = createPlayerCollection(true);
    expect(player).not.toBeNull();
    player = player!;
    expect(playerCollection.register(player)).toBe(false);
  });

  it("should allow a user to be removed", () => {
    let [playerCollection, player] = createPlayerCollection(true);
    expect(player).not.toBeNull();
    expect(playerCollection.length).toEqual(1);
    playerCollection.remove(player!);
    expect(playerCollection.length).toEqual(0);
  });

  it("should treat a user as active when they are not snoozed or an observer", () => {
    let [playerCollection, player] = createPlayerCollection(true);
    expect(player).not.toBeNull();
    player = player!;
    player.snoozed = false;
    player.observer = false;

    expect(playerCollection.active).toEqual([player]);
  });

  it("should treat a user as inactive when they are snoozed", () => {
    let [playerCollection, player] = createPlayerCollection(true);
    expect(player).not.toBeNull();
    player = player!;
    player.snoozed = true;
    player.observer = false;

    expect(playerCollection.active).toEqual([]);
  });

  it("should treat a user as inactive when they are an observer", () => {
    let [playerCollection, player] = createPlayerCollection(true);
    expect(player).not.toBeNull();
    player = player!;
    player.snoozed = false;
    player.observer = true;

    expect(playerCollection.active).toEqual([]);
  });

  it("should return false for all have chosen when no one has made a choice", () => {
    let [playerCollection, _] = createPlayerCollection(true);
    expect(playerCollection.allHaveChosen).toBe(false);
  });

  it("should return false for all have chosen when only one user has chosen", () => {
    let [playerCollection, player] = createPlayerCollection(true);
    expect(player).not.toBeNull();
    player = player!;
    player.choice = "1";

    expect(playerCollection.allHaveChosen).toBe(false);
  });

  it("should reset all player choices when a new player registers", () => {
    let [playerCollection, player] = createPlayerCollection(true);
    expect(player).not.toBeNull();
    player = player!;

    // Set a choice for the existing player
    player.choice = "5";
    expect(player.choice).toBe("5");

    // Register a new player - this should reset all choices
    let player2 = createPlayer();
    playerCollection.register(player2);

    // Get the original player from the collection after reset
    let originalPlayer = playerCollection.find((p) => p.name === player.name);
    expect(originalPlayer).not.toBeNull();

    // Verify that the original player's choice was reset
    expect(originalPlayer!.choice).toBeNull();
    // Verify that the new player also has no choice
    expect(player2.choice).toBeNull();
  });

  it("should return true for all have chosen when two players have chosen", () => {
    let [playerCollection, player] = createPlayerCollection(true);
    let player2 = createPlayer();
    playerCollection.register(player2);
    expect(player).not.toBeNull();
    player = player!;

    // Get the players from the collection after registration (which resets all choices)
    let originalPlayer = playerCollection.find((p) => p.name === player.name);
    let newPlayer = playerCollection.find((p) => p.name === player2.name);
    expect(originalPlayer).not.toBeNull();
    expect(newPlayer).not.toBeNull();

    // Set choices after registration (which resets all choices)
    originalPlayer!.choice = "1";
    newPlayer!.choice = "2";

    expect(playerCollection.allHaveChosen).toBe(true);
  });
});
