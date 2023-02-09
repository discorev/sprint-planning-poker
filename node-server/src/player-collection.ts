import { Player } from './models/player.model';

export class PlayerCollection extends Array<Player> {
    reset(): void {
        this.forEach(player => player.choice = null);
    }

    remove(player: Player) {
        this.splice(0, this.length, ...this.filter(plr => plr.name !== player.name));
        console.log(player.name, 'unregistered');
    }

    register(newPlayer: Player): boolean {
        if (this.find(player => player.name === newPlayer.name)) {
            return false;
        }
        this.push(newPlayer);
        return true;
    }

    push(...items: Player[]): number {
        const result = super.push(...items);
        this.reset();
        return result;
    }

    get active(): Player[] {
        return this.filter(player => player.snoozed !== true && player.observer === false)
    }

    get allHaveChosen(): boolean {
        // It doesn't count if there is only one player
        const active = this.active
        if (active.length <= 1) {
            return false;
        }
        return active.every(player => player.choice != null);
    }
}