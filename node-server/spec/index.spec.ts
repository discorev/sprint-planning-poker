import "jasmine";
import WebSocket = require('ws');

const websocketServerAddress = 'ws://localhost:8080';

describe("WebSocket Server", function () {
  var webSocketServer;

  beforeEach(function (done) {
    // ensure the websocket restarts by deleting the previous import cache
    delete require.cache[require.resolve('../src/index')];
    webSocketServer = require('../src/index');
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
    ws.on('message', function incoming(data: string) {
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
      ws.on('message', function incoming(data: string) {
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
      ws.on('message', function incoming(data: string) {
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
      ws.on('message', function incoming(data: string) {
        expect(JSON.parse(data)).toEqual({
          action: 'register',
          players: [jasmine.objectContaining({name: 'aaa', choice: null, snoozed: false})],
          reset: true});
        ws.close();
        done();
      });
  
      ws.on('open', () => {
        ws.send('{"action": "register", "name": "aaa"}');
      });
    });

    it("should error if two players try to use the same name", function(done) {
      const expectedPlayers = [jasmine.objectContaining({name: 'bbb', choice: null, snoozed: false})]

      const ws1 = new WebSocket(websocketServerAddress);
      const ws2 = new WebSocket(websocketServerAddress);
      let count = 0;
      ws2.on('message', function incoming(data: string) {
        if (count === 0) {
          expect(JSON.parse(data)).toEqual({players: expectedPlayers, reset: true}, 'Did not recieve register for player 1');
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
  
      ws1.on('message', function incoming(data: string) {
        expect(JSON.parse(data)).toEqual({action: 'register', players: expectedPlayers, reset: true});
        // registered = true;
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

  it("should be pinged after 3 seconds", function(done) {
    const ws = new WebSocket(websocketServerAddress);

    ws.on('ping', done);
  }, 3500);

  describe('When making a choice with just one player', function() {
    it("should reveal the choice as soon as it's made", function(done) {
      const ws = new WebSocket(websocketServerAddress);
      let count = 0;
      ws.on('message', function incoming(data: string) {
        if (count === 0) {
          expect(JSON.parse(data)).toEqual({action: 'register', players: [jasmine.objectContaining({name: 'ccc', snoozed: false, choice: null})], reset: true});
        } else if (count === 1) {
          expect(JSON.parse(data)).toEqual({choices: [{name: 'ccc', choice: '?', snoozed: false}]});
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
          expect(JSON.parse(data)).toEqual({action: 'register', players: [
            jasmine.objectContaining({name: 'ccc', choice: null, snoozed: false})], reset: true});
        }
        if (countCalls === 2) {
          expect(JSON.parse(data)).toEqual({choices: [{name: 'ccc', choice: '?', snoozed: false}]});
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
          expect(JSON.parse(data)).toEqual({action: 'register', players: [
            jasmine.objectContaining({name: 'ccc', choice: null, snoozed: false})], reset: true});
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
          expect(JSON.parse(data)).toEqual({action: 'register', players: [
            jasmine.objectContaining({name: 'ccc', choice: null, snoozed: false})], reset: true});
          ws.send(JSON.stringify({action: "snooze", player: "ccc"}));
        }
        if (countCalls === 2) {
          expect(JSON.parse(data)).toEqual({action: "snooze", player: 'ccc', snoozed: true});
          ws.send(JSON.stringify({action: "record-choice", choice: "?"}));
        }
        if (countCalls === 3) {
          expect(JSON.parse(data)).toEqual({choices: [{name: 'ccc', choice: '?', snoozed: false}]});
          ws.close();
          done();
        }
      });
      ws.on('message', messageCallback);
  
      ws.on('open', () => {
        ws.send('{"action": "register", "name": "ccc"}');


        setTimeout(() => {
          //expect(ws.send.calls.count()).toBe(3, 'Should send three messages');
          expect(messageCallback.calls.count()).toBe(3, 'Should get three callbacks');
          ws.close();
          done();
        }, 2000);
      });
    });
  });

  describe('when there are two players', function() {
    var ws1;
    var ws2;

    beforeEach(function (done) {
      ws1 = new WebSocket(websocketServerAddress);
      ws2 = new WebSocket(websocketServerAddress);
      let countPlayer1 = 0;
      let countPlayer2 = 0;
      ws1.on('message', function incoming(data) {
        data = JSON.parse(data);
        if (data.error === null && data.players) {
          countPlayer1 += 1;
        } else if (data.players && data.reset) {
          countPlayer1 += 1;
        }
        if (countPlayer1 === 2 && countPlayer2 === 2) {
          done();
        }
      });
      ws2.on('message', function incoming(data) {
        data = JSON.parse(data);
        if (data.error === null && data.players) {
          countPlayer2 += 1;
        } else if (data.players && data.reset) {
          countPlayer2 += 1;
        }
        if (countPlayer1 === 2 && countPlayer2 === 2) {
          done();
        }
      });

      ws1.on('open', function() {
        ws1.send(JSON.stringify({action: "register", name: "player1"}));
      });
      ws2.on('open', function() {
        ws2.send(JSON.stringify({action: "register", name: "player2"}));
      });
    });

    afterEach(function(done) {
      let count = 0;
      let finalTotal = 2;
      function closeConnection() {
        count += 1;
        if (count === finalTotal) {
          done(); 
        }
      }

      if (ws1.readyState === 1) {
        ws1.on('close', closeConnection);
        ws1.close();
      } else {
        finalTotal -= 1;
      }

      if (ws2.readyState === 1) {
        ws2.on('close', closeConnection);
        ws2.close();
      } else {
        finalTotal -= 1;
      }

      if (finalTotal === 0) {
        done();
      }
    });

    it('should send a message when a player disconnects', function(done) {
      ws2.on('message', function(data) {
        data = JSON.parse(data);
        if (data.players) {
          expect(data).toEqual({players: [jasmine.objectContaining({name: 'player2', choice: null, snoozed: false})], reset: true});
          done();
        }
      });
      ws1.close();
    });

    it('should send that a player has made a choice to the other players but not reveal it', function(done) {
      ws2.on('message', function(data) {
        data = JSON.parse(data);
        if (data.name) {
          expect(data).toEqual({name: 'player1', selected: true});
          done();
        }
      });
      ws1.send(JSON.stringify({action: 'record-choice', choice: '2'}));
    });

    it('should send an update when the player changes their mind showing they have deselected', function(done) {
      let count = 0;
      ws2.on('message', function(data) {
        data = JSON.parse(data);
        if (data.name) {
          if (count === 0) {
            expect(data).toEqual({name: 'player1', selected: true}, 'Player 1 has made a choice');
          }
          if (count === 1) {
            expect(data).toEqual({name: 'player1', selected: false}, 'Player 1 has unmade their choice');
            done();
          }
          count += 1;
        }
      });
      // First send an update to ensure it's marked as selected
      ws1.send(JSON.stringify({action: 'record-choice', choice: '2'}));
      // Then send an update to ensure it's marked as no-longer selected
      ws1.send(JSON.stringify({action: 'record-choice', choice: undefined}));
    });

    it('should reveal the choices once both players have made them', function(done) {
      ws2.on('message', function(data) {
        data = JSON.parse(data);
        if (data.choices) {
          expect(data).toEqual({choices: jasmine.arrayWithExactContents([
            { name: 'player1', choice: '2', snoozed: false },
            { name: 'player2', choice: '1', snoozed: false }
          ])});
          done();
        }
      });
      ws1.send(JSON.stringify({action: 'record-choice', choice: '2'}));
      ws2.send(JSON.stringify({action: 'record-choice', choice: '1'}));
    });

    it('should allow a player1 to snooze player2', function(done) {
      const expected = {action: "snooze", player: 'player2', snoozed: true};
      let count = 0;
      function incoming(data) {
        data = JSON.parse(data);
        expect(data).toEqual(expected);
        count +=1;
        if (count === 2) {
          done();
        }
      }
      ws1.on('message', incoming);
      ws2.on('message', incoming);
      ws1.send(JSON.stringify({action: 'snooze', player: 'player2'}));
    });

    it('should allow a player2 to snooze player1', function(done) {
      const expected = {action: "snooze", player: 'player1', snoozed: true};
      let count = 0;
      function incoming(data) {
        data = JSON.parse(data);
        expect(data).toEqual(expected);
        count +=1;
        if (count === 2) {
          done();
        }
      }
      ws1.on('message', incoming);
      ws2.on('message', incoming);
      ws2.send(JSON.stringify({action: 'snooze', player: 'player1'}));
    });

    it('should reveal the choices if one of the two players has been snoozed and the other makes a choice', function(done) {
      ws2.on('message', function(data) {
        data = JSON.parse(data);
        if (data.choices) {
          expect(data).toEqual({choices: jasmine.arrayWithExactContents([
            { name: 'player1', choice: '1', snoozed: false },
            { name: 'player2', choice: null, snoozed: true }
          ])});
          done();
        }
      });
      ws1.send(JSON.stringify({action: 'snooze', player: 'player2'}));
      ws1.send(JSON.stringify({action: 'record-choice', choice: '1'}));
    });

    it('should reveal the choices if one of the two players has made a choice and the other is snoozed', function(done) {
      ws2.on('message', function(data) {
        data = JSON.parse(data);
        if (data.choices) {
          expect(data).toEqual({choices: jasmine.arrayWithExactContents([
            { name: 'player1', choice: '1', snoozed: false },
            { name: 'player2', choice: null, snoozed: true }
          ])});
          done();
        } else {
          ws1.send(JSON.stringify({action: 'snooze', player: 'player2'}));
        }
      });
      ws1.send(JSON.stringify({action: 'record-choice', choice: '1'}));
    });
  });
});