import { Injectable } from '@angular/core';

import { Person } from '@app/models/person.model';
@Injectable({
  providedIn: 'root'
})
export class PlayerService {
  players: Person[] = [];

  constructor() { }

  findIndex(name: string): number {
    return this.players.findIndex(p => p.name === name);
  }

  public add(player: Person): void {
    const idx = this.findIndex(player.name);
    if (idx === -1) {
      this.players.push(player);
    }
  }

  public findByName(name: string): Person | null {
    const idx = this.findIndex(name);
    if (idx === -1) {
      return null;
    }
    return this.players[idx];
  }

  public listPlayers(): Person[] {
    return this.players;
  }

  public reset(): void {
    this.players.forEach(player => {
      player.choice = undefined;
      player.selected = false;
    });
  }

  public clear(): void {
    this.players = [];
  }

  activePlayers(): Person[] {
    return this.players.filter(person => !person.snoozed && !person.observer);
  }

  public allAgree(): boolean {
    const activePlayers = this.activePlayers();
    if (activePlayers.length < 2) {
      return false;
    }

    const firstChoice = activePlayers[0].choice;
    if (!firstChoice) {
      return false;
    }
    return activePlayers.every(person => person.choice === firstChoice);
  }
}
