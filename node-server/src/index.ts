import { createServer, type Server as HttpServer } from 'node:http'
import { originValidation, toNodeHandler } from '@modelcontextprotocol/node'

import { createPlanningPokerMcpHandler } from './mcp-server'
import { PlanningPokerSession, type PlanningPokerSessionOptions } from './planning-poker-session'
import { attachPlanningPokerWebSocketServer, type PlanningPokerWebSocketServer } from './websocket-server'

export interface PlanningPokerServerOptions extends PlanningPokerSessionOptions {
    readonly allowedOriginHostnames?: readonly string[]
    readonly leaseCleanupIntervalMs?: number
    readonly webSocketHeartbeatIntervalMs?: number
}

export interface PlanningPokerServer {
    readonly httpServer: HttpServer
    readonly session: PlanningPokerSession
    readonly webSocketServer: PlanningPokerWebSocketServer
    listen(port?: number, host?: string): Promise<number>
    close(): Promise<void>
}

export function createPlanningPokerServer(options: PlanningPokerServerOptions = {}): PlanningPokerServer {
    const session = new PlanningPokerSession(options)
    const mcpHandler = createPlanningPokerMcpHandler(session)
    const handleMcpRequest = toNodeHandler(mcpHandler.handler, {
        onerror: error => console.error('MCP HTTP adapter failed', error),
    })
    const validateOrigin = originValidation(
        options.allowedOriginHostnames
            ? [...options.allowedOriginHostnames]
            : configuredOriginHostnames(),
    )

    const httpServer = createServer((request, response) => {
        const pathname = request.url?.split('?', 1)[0] ?? '/'
        if (pathname !== '/mcp') {
            response.writeHead(404, { 'content-type': 'application/json' })
            response.end(JSON.stringify({ error: 'Not found' }))
            return
        }
        response.setHeader('X-Accel-Buffering', 'no')
        if (!validateOrigin(request, response)) {
            return
        }
        void handleMcpRequest(request, response)
    })

    const webSocketServer = attachPlanningPokerWebSocketServer(
        httpServer,
        session,
        options.webSocketHeartbeatIntervalMs,
    )
    const leaseCleanupTimer = setInterval(
        () => session.pruneExpiredParticipants(),
        options.leaseCleanupIntervalMs ?? session.heartbeatIntervalMs,
    )

    return {
        httpServer,
        session,
        webSocketServer,
        listen: (port = 8080, host) => new Promise<number>((resolve, reject) => {
            const onError = (error: Error): void => reject(error)
            httpServer.once('error', onError)
            httpServer.listen(port, host, () => {
                httpServer.off('error', onError)
                const address = httpServer.address()
                resolve(typeof address === 'object' && address ? address.port : port)
            })
        }),
        close: async () => {
            clearInterval(leaseCleanupTimer)
            await webSocketServer.close()
            await mcpHandler.close()
            if (httpServer.listening) {
                await new Promise<void>((resolve, reject) => {
                    httpServer.close(error => error ? reject(error) : resolve())
                })
            }
        },
    }
}

function configuredOriginHostnames(): string[] {
    const configured = (process.env.MCP_ALLOWED_ORIGINS ?? '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
        .map(value => {
            try {
                return new URL(value).hostname
            } catch {
                return value
            }
        })
    return [...new Set(['localhost', '127.0.0.1', '[::1]', ...configured])]
}

if (require.main === module) {
    const server = createPlanningPokerServer()
    void server.listen().then(port => {
        console.log(`Planning poker server listening on port ${port}`)
    })
}
