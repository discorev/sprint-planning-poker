# Sprint Planning Poker
[![build](https://github.com/discorev/sprint-planning-poker/actions/workflows/action.yml/badge.svg)](https://github.com/discorev/sprint-planning-poker/actions/workflows/action.yml)
[![codecov](https://codecov.io/gh/discorev/sprint-planning-poker/branch/main/graph/badge.svg?token=8IRZ65UZSB)](https://codecov.io/gh/discorev/sprint-planning-poker)
[![CodeFactor](https://www.codefactor.io/repository/github/discorev/sprint-planning-poker/badge)](https://www.codefactor.io/repository/github/discorev/sprint-planning-poker)

Sprint planning poker for mixed teams of humans and AI agents. Humans join
through a React frontend over WebSocket; agents join the same session through
the [Model Context Protocol](https://modelcontextprotocol.io) (MCP). Everyone
votes on the same rounds, sees the same reveals, and can pass a round subject
back and forth so agents know what is being estimated.

```
.
├── README.md              <-- This instructions file
├── frontend               <-- React and Vite frontend website
└── node-server            <-- WebSocket + MCP server
```

## node-server

A single Node HTTP server hosts both transports for one shared
`PlanningPokerSession`:

- **WebSocket** — upgraded on the same server; the frontend connects to
  `/api/ws` in development (proxied by Vite) and `/sprint-planning-poker/ws` in
  production.
- **MCP** — streamable HTTP at `/mcp` (modern protocol only; legacy
  initialization is rejected).

Both views are projections of the same state: participants, the current round
(`voting` or `revealed`, with an optional subject), and votes. Votes stay
private until every active, non-observer participant has voted, at which point
the round auto-reveals.

### MCP

Point an MCP-capable agent at the server and it can discover everything it
needs from the tool descriptions. For example, with Codex:

```toml
# ~/.codex/config.toml
[mcp_servers.planning-poker]
url = "https://<deployment-url>/mcp"
```

Or for Gemini:

```json
// ~/.gemini/config/mcp_config.json
{
  "mcpServers": {
    "planning-poker": {
      "serverUrl": "https://<deployment-url>/mcp",
      "url": "https://<deployment-url>/mcp",
      "type": "http",
      "protocolEra": "modern"
    }
  }
}
```

Note both `serverUrl` and `url` are set, and `protocolEra` must be `"modern"`
for the streamable HTTP endpoint.

For local testing use `http://localhost:8080/mcp` as the url (or
`http://localhost/mcp` when running via skaffold).

Then hand the agent a task like:

> Using the planning poker MCP server, join the session (pick a unique name),
> read the current round's subject, and vote on that task with a brief
> rationale grounded in the subject. Wait until the round is revealed, then
> report everyone's votes.

The server also exposes a `planning-poker://sessions/<id>` resource with the
public session state (with update notifications for clients that support
resource subscriptions) and a `participate-in-planning-poker` prompt that
instructs an agent how to estimate well.

Agent participants are leased: they heartbeat to stay in the session and are
expired if they go quiet. Private handles are never included in shared state.

### Departures and retained results

Leaving during voting removes a participant immediately. Once a round is
revealed, a departing voter (closed socket, `leave_session`, or an expired
lease) is retained — card, vote, and rationale — so results survive an agent
disconnecting mid-discussion. Browsers show retained players dimmed with a red
disconnected marker. Resetting the round purges them, and their name can be
reclaimed by rejoining.

### Running

```sh
cd node-server
pnpm install
pnpm dev          # nodemon, listens on :8080
pnpm test         # vitest
```

## frontend

React + Vite. Registered players pick cards from the deck, see everyone's
cards flip on reveal (with a rationale tooltip where one was given), and can
edit the shared "What are we estimating?" subject above the deck — changes
sync live to other browsers and to waiting agents.

```sh
cd frontend
bun install
bun start         # vite dev server on :4200
bun run test:unit # vitest
bun run e2e       # playwright
```

### Adding icons

FontAwesome Pro is an optional, fenced dependency: normal installs and builds skip
it because the app ships generated inline SVG components instead. To add an icon:

1. Run `bun install` with `FONTAWESOME_PACKAGE_TOKEN` set (without the token the optional fontawesome-pro dependency is skipped).
2. Add the icon to the list in `scripts/generate-icons.ts`.
3. Run `bun run icons:generate`.
4. Commit the generated icon components.

The Font Awesome Pro perpetual licence permits embedding these icons in the app;
do not republish them as an icon package.
