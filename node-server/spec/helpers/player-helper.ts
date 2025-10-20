import { Player } from '../../src/models/player.model';
import { PlayerCollection } from '../../src/player-collection'

export const createPlayer = (name: string | null = null) => {
    let names = ['bob', 'alice', 'dave']
    if (name === null) {
        name = names[Math.floor(Math.random() * names.length)]
    }
    return new Player(name)
}

export const createPlayerCollection = (withPlayer: boolean = false): [PlayerCollection, Player | null] => {
    let initial: Player[] = []
    var player: Player | null = null
    if (withPlayer) {
        player = createPlayer()
        initial.push(player)
    }
    return [new PlayerCollection(...initial), player]
}
