import WebSocket = require('ws');

import { Player }  from './models/player.model';
import { PlayerCollection } from './player-collection';

// Construct the websocket server
const wss = new WebSocket.Server({ port: 8080 });
const players = new PlayerCollection();

interface WSocket extends WebSocket {
    isAlive: boolean;
    player?: Player;
}

// Handle new conenctions
wss.on('connection', (ws: WSocket) => {
    // Add a state flag to this client as part of the heartbeat
    ws.isAlive = true;

    // A ping will be sent on an interval to check if clients
    // are still connected, when they respond, be sure to tag
    // them as still alive to prevent disconnecting them.
    ws.on('pong', () => {
        ws.isAlive = true;
    });
    
    // Handle messages from clients
    ws.on('message', function incoming(message: string) {
        var data = JSON.parse(message);

        // if the message is a register message, check if anyoen else has used
        // this name, if not, let it be used
        if(data.action === "register") {
            if (data.name.length < 3) {
                ws.send('{"action": "register","error": "name is too short"}');
                return;
            }
            const player = new Player(data.name);
            if (!players.register(player)) {
                ws.send('{"action": "register","error": "name is already taken"}');
                return;
            } else {
                // If for any reason teh WebSocket has closed
                // simply remove the player and stop
                if (ws.readyState !== WebSocket.OPEN) {
                    players.remove(player);
                    return;
                }
                ws.player = player;
                ws.send(JSON.stringify({
                    action: 'register',
                    players: players.slice(),
                    reset: true
                }));
                const msg = JSON.stringify({players: players.slice(), reset: true});
                wss.clients.forEach(function each(client) {
                    if (client != ws && client.readyState === WebSocket.OPEN) {
                        client.send(msg);
                    }
                });
            }
        }

        // All the rest of the options require registration
        if (!ws.player) {
            ws.send('{"error": "not registered"}');
            return;
        }

        if(data.action === "reset") {
            // reset all local votes
            players.reset();
            const msg = JSON.stringify({reset: true, originator: ws.player.name});
            wss.clients.forEach(function each(client) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(msg);
                }
            });
        }

        // If someone has made a choice, record it
        if(data.action === "record-choice") {
            // locate the player that made the choice
            const player = players.find(player => player === ws.player);
            player.snoozed = false; // this player is awake

            // Don't allow choices to be changed after they've been revealed
            if (players.allHaveChosen) {
                return;
            }

            player.choice = data.choice;
            console.log(player.name, 'made choice', data.choice);

            // Construct the response object
            var response = JSON.stringify({
                name: player.name,
                selected: (data.choice != null)
            });

            // If all players have made their choice, return the choices
            if(players.allHaveChosen) {
                response = JSON.stringify({choices: players.slice()});
            }

            wss.clients.forEach(function each(client) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(response);
                }
            });
        }

        if (data.action === "snooze" && data.player) {
            const player = players.find(player => player.name === data.player);
            if (!player) {
                ws.send('{"action": "snooze","error": "Player not found"}');
                return;
            }

            // Toggle the player's snooze status and update all clients
            player.snoozed = !player.snoozed;
            const msg = JSON.stringify({action: "snooze", player: player.name, snoozed: player.snoozed});
            wss.clients.forEach(function each(client) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(msg);
                }
            });

            if (players.length > 1 && players.allHaveChosen) {
                const msg = JSON.stringify({choices: players});
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(msg);
                    }
                })
            }
        }
    });

    ws.on('close', function close(code, reason) {
        console.log('Closed', ws.player, code, reason);
        if (ws.player) {
            players.remove(ws.player);
            const msg = JSON.stringify({players: players.slice(), reset: true});
            wss.clients.forEach(function each(client) {
                if (client != ws && client.readyState === WebSocket.OPEN) {
                    client.send(msg);
                }
            });
        }
    })

    // Log that the client has connected
    console.log('Connected');
});

// Setup a timer to act as a heart-beat to check that the clients
// are still alive (if someone's browser craches etc. they will disconnect)
setInterval(() => {
    (wss.clients as Set<WSocket>).forEach(function each(ws: WSocket) {
        if (ws.isAlive === false) {
            if(ws.player) {
                players.remove(ws.player);
                const msg = JSON.stringify({players: players.slice(), reset: true});
                wss.clients.forEach(function each(client) {
                    if (client != ws && client.readyState === WebSocket.OPEN) {
                        client.send(msg);
                    }
                });
            }
            console.log('Client is dead');
            return ws.terminate();
        }

        ws.isAlive = false;
        ws.ping(() => {});
    });
}, 3000);

// expose the WebSocket Server
module.exports = wss;
