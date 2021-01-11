const WebSocket = require('ws');

describe("WebSocket Server", function () {
  var webSocketServer;

  beforeEach(function (done) {
    // ensure the websocket restarts by deleting the previous import cache
    delete require.cache[require.resolve('../index')];
    webSocketServer = require('../index');
    webSocketServer.on('listening', () => {
      console.log('Listening on port 8080');
      done();
    });
  });

  afterEach(function (done) {
    if (webSocketServer != null) {
      webSocketServer.close(function close() {
        webSocketServer = null;
        done();
      });
    }
  });

  it("Test the websocket is connected", function(done) {
    const ws = new WebSocket('ws://localhost:8080');
    ws.on('open', function () {
      expect(ws.readyState).toBe(1);
      ws.close();
      done();
    });
  });

  it("should reject a single character name", function(done) {
    const ws = new WebSocket('ws://localhost:8080');
    ws.on('message', function incoming(data) {
      expect(data).toBe('{"error": "name is too short"}');
      ws.close();
      done();
    });

    ws.on('open', () => {
      ws.send('{"action": "register", "name": "a"}');
    });
  });

  it("should reject a two character name", function(done) {
    const ws = new WebSocket('ws://localhost:8080');
    ws.on('message', function incoming(data) {
      expect(data).toBe('{"error": "name is too short"}');
      ws.close();
      done();
    });

    ws.on('open', () => {
      ws.send('{"action": "register", "name": "aa"}');
    });
  });

  it("should register a three character name", function(done) {
    const ws = new WebSocket('ws://localhost:8080');
    ws.on('message', function incoming(data) {
      expect(JSON.parse(data)).toEqual({error: null, players: ['aaa'], reset: true});
      ws.close();
      done();
    });

    ws.on('open', () => {
      ws.send('{"action": "register", "name": "aaa"}');
    });
  });

  it("should return an error if the user has not registered", function(done) {
    const ws = new WebSocket('ws://localhost:8080');
    ws.on('message', function incoming(data) {
      expect(data).toBe('{"error": "not registered"}');
      ws.close();
      done();
    });

    ws.on('open', () => {
      ws.send('{"action": "test"}');
    });
  });
});