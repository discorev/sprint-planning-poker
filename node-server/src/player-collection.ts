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

    get allHaveChosen(): boolean {
        return this.every(player => (player.choice != null || player.snoozed === true));
    }
}