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

  it("should error if two players try to use the same name", function(done) {
    const ws1 = new WebSocket('ws://localhost:8080');
    const ws2 = new WebSocket('ws://localhost:8080');
    let count = 0;
    ws2.on('message', function incoming(data) {
      if (count === 0) {
        expect(JSON.parse(data)).toEqual({players: ['bbb'], reset: true}, 'Did not recieve register for player 1');
      } else if (count === 1) {
        expect(data).toBe('{"error": "name is already taken"}', 'expect an error from player 2');
      }
      count += 1;
      if (count === 2) {
        ws1.close();
        ws2.close();
        done();
      }
    });

    ws1.on('message', function incoming(data) {
      expect(JSON.parse(data)).toEqual({error: null, players: ['bbb'], reset: true});
      registered = true;
      ws2.send('{"action": "register", "name": "bbb"}');
    });

    ws1.on('open', () => {
      ws1.send('{"action": "register", "name": "bbb"}');
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

  it("should forward reset message to all connected clients", function(done) {
    const ws = new WebSocket('ws://localhost:8080');
    const ws2 = new WebSocket('ws://localhost:8080');

    let count = 0;
    function callbackCheck(data) {
      if (data.includes('originator')) {
        expect(JSON.parse(data)).toEqual({reset: true, originator: 'aaa'});
        count += 1;
        if (count == 2) {
          ws.close();
          ws2.close();
          done();
        }
      }
    }

    ws.on('message', callbackCheck);
    ws2.on('message', callbackCheck);

    ws.on('open', () => {
      ws.send('{"action": "register", "name": "aaa"}');
      ws.send('{"action": "reset"}');
    });
  });
});