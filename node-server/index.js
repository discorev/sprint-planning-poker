const WebSocket = require('ws');

// Construct the websocket server
const wss = new WebSocket.Server({ port: 8080 });

names = [];
choices = [];

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
                ws.send('{"error": "name is too short"}');
                return;
            }
            if (names.indexOf(data.name) === -1) {
                choices = [];
                names.push(data.name);
                ws.name = data.name;
                console.log("registered:", ws.name);
                ws.send(JSON.stringify({
                    error: null,
                    players: names,
                    reset: true
                }));
                const msg = JSON.stringify({players: names, reset: true});
                wss.clients.forEach(function each(client) {
                    if (client != ws && client.readyState === WebSocket.OPEN) {
                        client.send(msg);
                    }
                });
            } else {
                ws.send('{"error": "name is already taken"}');
                return;
            }
        }

        // All the rest of the options require registration
        if (!ws.name) {
            ws.send('{"error": "not registered"}');
            return;
        }

        if(data.action === "reset") {
            // reset all local votes
            choices = []; // reset the local choice array
            const msg = JSON.stringify({reset: true, originator: ws.name});
            wss.clients.forEach(function each(client) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(msg);
                }
            });
        }

        // If someone has made a choice, record it
        if(data.action === "record-choice") {
            // Don't allow choices to be changed after they've been revealed
            if (choices.length == names.length) {
                return;
            }
            // First ensure any choice already made is removed
            choices = choices.filter(choice => choice.name != ws.name);
            var response = {name: ws.name};
            console.log(ws.name, 'made choice', data.choice);
            // Was the user making a choice, or, deselecting a choice
            if (data.choice) {
                // Then add the the new choice
                choices.push({name: ws.name, choice: data.choice});
                response.selected = true;

                // Reveal all choices to all users
                if (choices.length == names.length) {
                    response = {choices};
                }
            } else {
                // Mark that the user deselected their choice
                response.selected = false;
            }
            const msg = JSON.stringify(response);
            wss.clients.forEach(function each(client) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(msg);
                }
            });
        }
    });

    ws.on('close', function close(code, reason) {
        console.log('Closed', ws.name, code, reason);
        if(ws.name) {
            names = names.filter(name => name != ws.name);
            console.log(ws.name, 'unregistered');
            const msg = JSON.stringify({players: names, reset: true});
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
                names = names.filter(name => name != ws.name);
                console.log(ws.name, 'unregistered');
                const msg = JSON.stringify({players: names, reset: true});
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
