const WebSocket = require('ws');

const websocketServerAddress = 'ws://localhost:8080';

describe("WebSocket Server", function () {
  var webSocketServer;

  beforeEach(function (done) {
    // ensure the websocket restarts by deleting the previous import cache
    delete require.cache[require.resolve('../index')];
    webSocketServer = require('../index');
    webSocketServer.on('listening', done);
  });

  afterEach(function (done) {
    if (webSocketServer != null) {
      webSocketServer.close(function close() {
        webSocketServer = null;
        done();
      });
    }
  });

  it("should return an error if the user has not registered", function(done) {
    const ws = new WebSocket(websocketServerAddress);
    ws.on('message', function incoming(data) {
      expect(JSON.parse(data)).toEqual({error: "not registered"});
      ws.close();
      done();
    });

    ws.on('open', () => {
      ws.send('{"action": "test"}');
    });
  });

  describe('When registering a player', function() {
    it("should not allow a single character name", function(done) {
      const ws = new WebSocket(websocketServerAddress);
      ws.on('message', function incoming(data) {
        expect(JSON.parse(data)).toEqual({action: "register", error: "name is too short"});
        ws.close();
        done();
      });
  
      ws.on('open', () => {
        ws.send('{"action": "register", "name": "a"}');
      });
    });

    it("should not allow a two character name", function(done) {
      const ws = new WebSocket(websocketServerAddress);
      ws.on('message', function incoming(data) {
        expect(JSON.parse(data)).toEqual({action: "register", error: "name is too short"});
        ws.close();
        done();
      });
  
      ws.on('open', () => {
        ws.send('{"action": "register", "name": "aa"}');
      });
    });

    it("should allow a three character name", function(done) {
      const ws = new WebSocket(websocketServerAddress);
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
      const ws1 = new WebSocket(websocketServerAddress);
      const ws2 = new WebSocket(websocketServerAddress);
      let count = 0;
      ws2.on('message', function incoming(data) {
        if (count === 0) {
          expect(JSON.parse(data)).toEqual({players: ['bbb'], reset: true}, 'Did not recieve register for player 1');
        } else if (count === 1) {
          expect(JSON.parse(data)).toEqual({action: "register", error: "name is already taken"}, 'expect an error from player 2');
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
  });

  it("should forward a reset message to all connected clients", function(done) {
    const ws1 = new WebSocket(websocketServerAddress);
    const ws2 = new WebSocket(websocketServerAddress);

    let count = 0;
    function callbackCheck(data) {
      if (data.includes('originator')) {
        expect(JSON.parse(data)).toEqual({reset: true, originator: 'aaa'});
        count += 1;
        if (count == 2) {
          ws1.close();
          ws2.close();
          done();
        }
      }
    }

    ws1.on('message', callbackCheck);
    ws2.on('message', callbackCheck);

    ws1.on('open', () => {
      ws1.send('{"action": "register", "name": "aaa"}');
      ws1.send('{"action": "reset"}');
    });
  });

  describe('When making a choice with just one player', function() {
    it("should reveal the choice as soon as it's made", function(done) {
      const ws = new WebSocket(websocketServerAddress);
      let count = 0;
      ws.on('message', function incoming(data) {
        if (count === 0) {
          expect(JSON.parse(data)).toEqual({error: null, players: ['ccc'], reset: true});
        } else if (count === 1) {
          expect(JSON.parse(data)).toEqual({choices: [{name: 'ccc', choice: '?', snooze: false}]});
        }
        count += 1;
        if (count === 2) {
          ws.close();
          done();
        }
      });
  
      ws.on('open', () => {
        ws.send('{"action": "register", "name": "ccc"}');
        ws.send(JSON.stringify({action: 'record-choice', choice: '?'}));
      });
    });

    it("should not allow choice to be changed after it has been revealed", function(done) {
      const ws = new WebSocket(websocketServerAddress);
      const messageCallback = jasmine.createSpy('messageCallback');

      messageCallback.and.callFake((data) => {
        const countCalls = messageCallback.calls.count();
        if (countCalls === 1) {
          expect(JSON.parse(data)).toEqual({error: null, players: ['ccc'], reset: true});
        }
        if (countCalls === 2) {
          expect(JSON.parse(data)).toEqual({choices: [{name: 'ccc', choice: '?', snooze: false}]});
          messageCallback.calls.reset(); // reset the count so if any more events are fired, they will be counted
          // wait 1 second to ensure no more calls are made
          setTimeout(() => {
            expect(messageCallback.calls.count()).toBe(0);
            ws.close();
            done();
          }, 1000);
        }
      })
      ws.on('message', messageCallback);
  
      ws.on('open', () => {
        ws.send('{"action": "register", "name": "ccc"}');
        ws.send(JSON.stringify({action: 'record-choice', choice: '?'}));
        ws.send(JSON.stringify({action: 'record-choice', choice: '1'}));
      });
    });

    it("should fail to snooze an unknown player", function(done) {
      const ws = new WebSocket(websocketServerAddress);
      const messageCallback = jasmine.createSpy('messageCallback');

      spyOn(ws, 'send').and.callThrough();

      messageCallback.and.callFake((data) => {
        const countCalls = messageCallback.calls.count();
        if (countCalls === 1) {
          expect(JSON.parse(data)).toEqual({error: null, players: ['ccc'], reset: true});
          ws.send(JSON.stringify({action: "snooze", player: "aaa"}));
        }
        if (countCalls === 2) {
          expect(JSON.parse(data)).toEqual({action: "snooze", error: "Player not found"});
          ws.close();
          done();
        }
      });
      ws.on('message', messageCallback);
  
      ws.on('open', () => {
        ws.send('{"action": "register", "name": "ccc"}');
      });
    });

    it("should wake up when you make a choice after snoozing", function(done) {
      const ws = new WebSocket(websocketServerAddress);
      const messageCallback = jasmine.createSpy('messageCallback');

      spyOn(ws, 'send').and.callThrough();

      messageCallback.and.callFake((data) => {
        const countCalls = messageCallback.calls.count();
        if (countCalls === 1) {
          expect(JSON.parse(data)).toEqual({error: null, players: ['ccc'], reset: true});
          ws.send(JSON.stringify({action: "snooze", player: "ccc"}));
        }
        if (countCalls === 2) {
          expect(JSON.parse(data)).toEqual({action: "snooze", player: 'ccc', snooze: true});
          ws.send(JSON.stringify({action: "record-choice", choice: "?"}));
        }
        if (countCalls === 3) {
          expect(JSON.parse(data)).toEqual({choices: [{name: 'ccc', choice: '?', snooze: false}]});
          ws.close();
          done();
        }
      });
      ws.on('message', messageCallback);
  
      ws.on('open', () => {
        ws.send('{"action": "register", "name": "ccc"}');


        setTimeout(() => {
          expect(ws.send.calls.count()).toBe(3, 'Should send three messages');
          expect(messageCallback.calls.count()).toBe(3, 'Should get three callbacks');
          ws.close();
          done();
        }, 2000);
      });
    });
  });
});