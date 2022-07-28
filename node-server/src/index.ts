import WebSocket = require('ws')

import { Player }  from './models/player.model'
import { PlayerCollection } from './player-collection'
import { isAction, isRegisterAction, isRecordChoiceAction, isSnoozeAction } from './models/guards'

// Construct the websocket server
const wss = new WebSocket.Server({ port: 8080 })
const players = new PlayerCollection()

interface WSocket extends WebSocket {
    isAlive: boolean
    player?: Player
}

const sendError = (ws: WSocket, message: string, action?: string) => {
    const error = {error: message}
    if (action) {
        error["action"] = action
    }
    ws.send(JSON.stringify(error))
}

const decodeJson = (json: string): any => {
    try {
        return JSON.parse(json)
    } catch {
        return undefined
    }
}

// Handle new conenctions
wss.on('connection', (ws: WSocket) => {
    // Add a state flag to this client as part of the heartbeat
    ws.isAlive = true

    // A ping will be sent on an interval to check if clients
    // are still connected, when they respond, be sure to tag
    // them as still alive to prevent disconnecting them.
    ws.on('pong', () => {
        ws.isAlive = true
    })
    
    // Handle messages from clients
    ws.on('message', function incoming(payload: string) {
        // Use a custom decode function that catches exceptions and returns undefined if
        // the JSON cannot be parsed (to prevent crashes)
        const message = decodeJson(payload)
        if (!isAction(message)) {
            return sendError(ws, "malformed request, missing action")
        }

        // if the message is a register message, check if anyoen else has used
        // this name, if not, let it be used
        if(isRegisterAction(message)) {
            if (message.name.length < 3) {
                return sendError(ws, "name is too short", message.action)
            }
            const player = new Player(message.name)
            if (!players.register(player)) {
                return sendError(ws, "name is already taken", message.action)
            }
            // If for any reason teh WebSocket has closed
            // simply remove the player and stop
            if (ws.readyState !== WebSocket.OPEN) {
                players.remove(player)
                return
            }
            ws.player = player
            ws.send(JSON.stringify({
                action: 'register',
                players: players.slice(),
                reset: true
            }))
            const msg = JSON.stringify({players: players.slice(), reset: true})
            wss.clients.forEach(function each(client) {
                if (client != ws && client.readyState === WebSocket.OPEN) {
                    client.send(msg)
                }
            })
        }

        // All the rest of the options require registration
        if (!ws.player) {
            return sendError(ws, "not registered")
        }

        if(message.action === "reset") {
            // reset all local votes
            players.reset()
            const msg = JSON.stringify({reset: true, originator: ws.player.name})
            wss.clients.forEach(function each(client) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(msg)
                }
            })
        }

        // If someone has made a choice, record it
        if (isRecordChoiceAction(message)) {
            // locate the player that made the choice
            const player = players.find(player => player === ws.player)
            player.snoozed = false // this player is awake

            // Don't allow choices to be changed after they've been revealed
            if (players.allHaveChosen) {
                return
            }

            player.choice = message.choice
            console.log(player.name, 'made choice', message.choice, 'it was good')

            // Construct the response object
            var response = JSON.stringify({
                name: player.name,
                selected: (message.choice != null)
            })

            // If all players have made their choice, return the choices
            if(players.allHaveChosen) {
                response = JSON.stringify({choices: players.slice()})
            }

            wss.clients.forEach(function each(client) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(response)
                }
            })
        }

        if (isSnoozeAction(message)) {
            const player = players.find(player => player.name === message.player)
            if (!player) {
                return sendError(ws, "Player not found", message.action)
            }

            // Toggle the player's snooze status and update all clients
            player.snoozed = !player.snoozed
            const msg = JSON.stringify({action: "snooze", player: player.name, snoozed: player.snoozed})
            wss.clients.forEach(function each(client) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(msg)
                }
            })

            if (players.length > 1 && players.allHaveChosen) {
                const msg = JSON.stringify({choices: players})
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(msg)
                    }
                })
            }
        }
    })

    ws.on('close', function close(code, reason) {
        console.log('Closed', ws.player, code, reason)
        if (ws.player) {
            players.remove(ws.player)
            const msg = JSON.stringify({players: players.slice(), reset: true})
            wss.clients.forEach(function each(client) {
                if (client != ws && client.readyState === WebSocket.OPEN) {
                    client.send(msg)
                }
            })
        }
    })

    // Log that the client has connected
    console.log('Connected')
})

// Setup a timer to act as a heart-beat to check that the clients
// are still alive (if someone's browser craches etc. they will disconnect)
setInterval(() => {
    (wss.clients as Set<WSocket>).forEach(function each(ws: WSocket) {
        if (ws.isAlive === false) {
            if(ws.player) {
                players.remove(ws.player)
                const msg = JSON.stringify({players: players.slice(), reset: true})
                wss.clients.forEach(function each(client) {
                    if (client != ws && client.readyState === WebSocket.OPEN) {
                        client.send(msg)
                    }
                })
            }
            console.log('Client is dead')
            return ws.terminate()
        }

        ws.isAlive = false
        ws.ping(() => {})
    })
}, 3000)

// expose the WebSocket Server
module.exports = wss
