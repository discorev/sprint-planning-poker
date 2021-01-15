const WebSocket = require('ws');
const Player = require('./player');
// Construct the websocket server
const wss = new WebSocket.Server({ port: 8080 });

players = [];

function reset() {
    players.forEach(player => player.choice = null);
}

function removeByName(name) {
    players = players.filter(player => player.name != name);
    console.log(name, 'unregistered');
}

function listNames() {
    return players.map(player => player.name);
}

function allHaveChosen() {
    return players.every(player => (player.choice != null || player.snoozed === true));
}

// Handle new conenctions
wss.on('connection', ws => {
    // Add a state flag to this client as part of the heartbeat
    ws.isAlive = true;

    // A ping will be sent on an interval to check if clients
    // are still connected, when they respond, be sure to tag
    // them as still alive to prevent disconnecting them.
    ws.on('pong', () => {
        ws.isAlive = true;
    });
    
    // Handle messages from clients
    ws.on('message', function incoming(message) {
        var data = JSON.parse(message);

        // if the message is a register message, check if anyoen else has used
        // this name, if not, let it be used
        if(data.action === "register") {
            if (data.name.length < 3) {
                ws.send('{"action": "register","error": "name is too short"}');
                return;
            }
            if (players.find(el => el.name == data.name)) {
                ws.send('{"action": "register","error": "name is already taken"}');
                return;
            } else {
                reset();
                players.push(new Player(data.name));
                ws.name = data.name;
                const playerNames = listNames();
                ws.send(JSON.stringify({
                    error: null,
                    players: playerNames,
                    reset: true
                }));
                const msg = JSON.stringify({players: playerNames, reset: true});
                wss.clients.forEach(function each(client) {
                    if (client != ws && client.readyState === WebSocket.OPEN) {
                        client.send(msg);
                    }
                });
            }
        }

        // All the rest of the options require registration
        if (!ws.name) {
            ws.send('{"error": "not registered"}');
            return;
        }

        if(data.action === "reset") {
            // reset all local votes
            reset();
            const msg = JSON.stringify({reset: true, originator: ws.name});
            wss.clients.forEach(function each(client) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(msg);
                }
            });
        }

        // If someone has made a choice, record it
        if(data.action === "record-choice") {
            // locate the player that made the choice
            const player = players.find(player => player.name === ws.name);
            player.snoozed = false; // this player is awake

            // Don't allow choices to be changed after they've been revealed
            if(allHaveChosen()) {
                return;
            }

            player.choice = data.choice;
            console.log(player.name, 'made choice', data.choice);

            // Construct the response object
            var response = {name: player.name, selected: (data.choice != null)};

            // If all players have made their choice, return the choices
            if(allHaveChosen()) {
                response = {choices: players};
            }

            const msg = JSON.stringify(response);
            wss.clients.forEach(function each(client) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(msg);
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

            if (players.length > 1 && allHaveChosen()) {
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
        console.log('Closed', ws.name, code, reason);
        if(ws.name) {
            removeByName(ws.name);
            const msg = JSON.stringify({players: listNames(), reset: true});
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
_ = setInterval(() => {
    wss.clients.forEach(function each(ws) {
        if (ws.isAlive === false) {
            if(ws.name) {
                removeByName(ws.name);
                const msg = JSON.stringify({players: listNames(), reset: true});
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
