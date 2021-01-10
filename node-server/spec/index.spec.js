const WebSocket = require('ws');

// hack to make unit tests block without causing the server to stop
function sleep(milliseconds) {
  const date = Date.now();
  let currentDate = null;
  do {
    currentDate = Date.now();
  } while (currentDate - date < milliseconds);
}

describe("WebSocket Server", function () {
  var webSocketServer;

  beforeEach(function (done) {
    // ensure the websocket restarts by deleting the previous import cache
    delete require.cache[require.resolve('../index')];
    webSocketServer = require('../index');
    webSocketServer.on('listening', () => {
      console.log('Listening on port 3000');
      done();
    });
  });

  afterEach(function (done) {
    if (webSocketServer != null) {
      sleep(100);
      webSocketServer.close(function close() {
        webSocketServer = null;
        done();
      });
    }
  });

  it("Test the websocket is connected", function() {
    const ws = new WebSocket('ws://localhost:3000');
    ws.on('open', function () {
      expect(ws.readyState).toBe(1);
      ws.close();
    });
    sleep(5);
  });

  it("should reject a single character name", function() {
    const ws = new WebSocket('ws://localhost:3000');
    ws.on('message', function incoming(data) {
      expect(data).toBe('{"error": "name is too short"}');
      ws.close();
    });

    ws.on('open', () => {
      ws.send('{"action": "register", "name", "a"');
    });

    sleep(5);
  });

  it("should reject a two character name", function() {
    const ws = new WebSocket('ws://localhost:3000');
    ws.on('message', function incoming(data) {
      expect(data).toBe('{"error": "name is too short"}');
      ws.close();
    });

    ws.on('open', () => {
      ws.send('{"action": "register", "name", "aa"');
    });

    sleep(5);
  });

  it("should register a three character name", function() {
    const ws = new WebSocket('ws://localhost:3000');
    ws.on('message', function incoming(data) {
      expect(JSON.parse(data)).toBe({error: null, players: ['aaa'], reset: true});
      ws.close();
    });

    ws.on('open', () => {
      ws.send('{"action": "register", "name", "aaa"');
    });

    sleep(5);
  });
});