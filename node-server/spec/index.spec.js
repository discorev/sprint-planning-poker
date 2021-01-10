const WebSocket = require('ws');
const request = require('superwstest');

describe("WebSocket Server", function() {
    var wss;

    beforeEach(function(done) {
      delete require.cache[require.resolve('../index')];
      wss = require('../index');
      wss.on('listening', () => {
        console.log('Listening on port 3000');
        done();
      });
    });

    afterEach(function(done) {
      wss.close(done);
    });
  
    it("Test the websocket is connected", function(done) {
      const ws = new WebSocket('ws://localhost:3000');
      ws.on('open', function() {
        expect(ws.readyState).toBe(1);
        done();
      });
    });

    it("should reject registering names shorter than 3 characters", async () => {
      await request
            .ws('/')
            .sendJson({action: "register", name: "a"})
            .expectJson({error: "name is too short"});

      // const ws = new WebSocket('ws://localhost:3000');
      // ws.on('message', function incoming(data) {
      //   expect(data).toBe('{"error": "name is too short"}');
      //   done();
      // });

      // ws.on('open', () => {
      //   ws.send('{"action": "register", "name", "a"');
      // });
    });
});