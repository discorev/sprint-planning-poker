import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlanningPokerSocket, planningPokerSocketUrl } from './planning-poker-socket';

class FakeWebSocket {
  public readyState: number = WebSocket.CONNECTING;
  public readonly sent: string[] = [];
  private readonly listeners = new Map<string, Set<(event: Event) => void>>();

  public addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const callback = typeof listener === 'function'
      ? listener
      : (event: Event) => listener.handleEvent(event);
    const listeners = this.listeners.get(type) ?? new Set<(event: Event) => void>();
    listeners.add(callback);
    this.listeners.set(type, listeners);
  }

  public send(message: string): void {
    this.sent.push(message);
  }

  public close(): void {
    if (this.readyState === WebSocket.CLOSED) {
      return;
    }
    this.readyState = WebSocket.CLOSED;
    this.emit('close', new Event('close'));
  }

  public open(): void {
    this.readyState = WebSocket.OPEN;
    this.emit('open', new Event('open'));
  }

  public message(value: unknown): void {
    this.emit('message', new MessageEvent('message', { data: JSON.stringify(value) }));
  }

  public rawMessage(value: string): void {
    this.emit('message', new MessageEvent('message', { data: value }));
  }

  public error(): void {
    this.emit('error', new Event('error'));
  }

  private emit(type: string, event: Event): void {
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe('planningPokerSocketUrl', () => {
  it('uses the current host, matching websocket scheme, and development proxy path', () => {
    expect(planningPokerSocketUrl({
      protocol: 'https:',
      host: 'poker.example.test:4200',
    } as unknown as Location)).toBe('wss://poker.example.test:4200/api/ws');
    expect(planningPokerSocketUrl({
      protocol: 'http:',
      host: '127.0.0.1:4200',
    } as unknown as Location)).toBe('ws://127.0.0.1:4200/api/ws');
  });
});

describe('PlanningPokerSocket', () => {
  it('reports registration failure when the socket is not open', () => {
    const fake = new FakeWebSocket();
    const result = vi.fn<(success: boolean, error?: string) => void>();
    const socket = new PlanningPokerSocket({
      url: 'ws://example.test/api/ws',
      createWebSocket: () => fake as unknown as WebSocket,
      storage: window.localStorage,
      onConnectionChange: () => undefined,
      onMessage: () => undefined,
    });

    socket.register('Alice', false, result);

    expect(result).toHaveBeenCalledWith(false);
    expect(fake.sent).toHaveLength(0);
    socket.close();
  });

  it('confirms registration before forwarding the server message', () => {
    const fake = new FakeWebSocket();
    const order: string[] = [];
    const socket = new PlanningPokerSocket({
      url: 'ws://example.test/api/ws',
      createWebSocket: () => fake as unknown as WebSocket,
      storage: window.localStorage,
      onConnectionChange: () => undefined,
      onMessage: () => order.push('message'),
    });

    fake.open();
    socket.register('Alice', true, (success) => order.push(`registration:${success}`));
    expect(JSON.parse(fake.sent[0])).toEqual({ action: 'register', name: 'Alice', observer: true });
    fake.message({ action: 'register', players: [], reset: true });

    expect(order).toEqual(['registration:true', 'message']);
    expect(window.localStorage.getItem('name')).toBe('Alice');
    socket.close();
  });

  it('clears identity and reports the server registration error', () => {
    const fake = new FakeWebSocket();
    const result = vi.fn<(success: boolean, error?: string) => void>();
    const socket = new PlanningPokerSocket({
      url: 'ws://example.test/api/ws',
      createWebSocket: () => fake as unknown as WebSocket,
      storage: window.localStorage,
      onConnectionChange: () => undefined,
      onMessage: () => undefined,
    });

    fake.open();
    socket.register('Alice', false, result);
    fake.message({ action: 'register', error: 'name is already taken' });

    expect(result).toHaveBeenCalledWith(false, 'name is already taken');
    expect(window.localStorage.getItem('name')).toBeNull();
    socket.close();
  });

  it('fails an in-flight registration when the connection closes', () => {
    vi.useFakeTimers();
    const fake = new FakeWebSocket();
    const result = vi.fn<(success: boolean, error?: string) => void>();
    const socket = new PlanningPokerSocket({
      url: 'ws://example.test/api/ws',
      createWebSocket: () => fake as unknown as WebSocket,
      storage: window.localStorage,
      onConnectionChange: () => undefined,
      onMessage: () => undefined,
    });

    fake.open();
    socket.register('Alice', false, result);
    fake.close();

    expect(result).toHaveBeenCalledOnce();
    expect(result).toHaveBeenCalledWith(false, 'connection lost, please try again');
    socket.close();
  });

  it('reconnects after one second and automatically re-registers by name', () => {
    vi.useFakeTimers();
    const sockets: FakeWebSocket[] = [];
    const connectionStates: boolean[] = [];
    const socket = new PlanningPokerSocket({
      url: 'ws://example.test/api/ws',
      createWebSocket: () => {
        const fake = new FakeWebSocket();
        sockets.push(fake);
        return fake as unknown as WebSocket;
      },
      storage: window.localStorage,
      onConnectionChange: (connected) => connectionStates.push(connected),
      onMessage: () => undefined,
    });

    sockets[0].open();
    socket.register('Alice', true, () => undefined);
    sockets[0].message({ action: 'register' });
    sockets[0].close();
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);
    sockets[1].open();

    expect(JSON.parse(sockets[1].sent[0])).toEqual({ action: 'register', name: 'Alice' });
    expect(connectionStates).toEqual([true, false, true]);
    socket.close();
  });

  it('ignores malformed messages and reconnects after socket errors', () => {
    vi.useFakeTimers();
    const sockets: FakeWebSocket[] = [];
    const onMessage = vi.fn();
    const socket = new PlanningPokerSocket({
      url: 'ws://example.test/api/ws',
      createWebSocket: () => {
        const fake = new FakeWebSocket();
        sockets.push(fake);
        return fake as unknown as WebSocket;
      },
      storage: window.localStorage,
      onConnectionChange: () => undefined,
      onMessage,
    });

    sockets[0].open();
    sockets[0].rawMessage('not-json');
    sockets[0].error();
    vi.advanceTimersByTime(1_000);

    expect(onMessage).not.toHaveBeenCalled();
    expect(sockets).toHaveLength(2);
    socket.close();
  });

  it('cancels pending reconnects when closed permanently', () => {
    vi.useFakeTimers();
    const sockets: FakeWebSocket[] = [];
    const socket = new PlanningPokerSocket({
      url: 'ws://example.test/api/ws',
      createWebSocket: () => {
        const fake = new FakeWebSocket();
        sockets.push(fake);
        return fake as unknown as WebSocket;
      },
      storage: window.localStorage,
      onConnectionChange: () => undefined,
      onMessage: () => undefined,
    });

    sockets[0].open();
    sockets[0].close();
    socket.close();
    vi.advanceTimersByTime(1_000);

    expect(sockets).toHaveLength(1);
  });

  it('does not coalesce outbound messages', () => {
    const fake = new FakeWebSocket();
    const socket = new PlanningPokerSocket({
      url: 'ws://example.test/api/ws',
      createWebSocket: () => fake as unknown as WebSocket,
      storage: window.localStorage,
      onConnectionChange: () => undefined,
      onMessage: () => undefined,
    });

    fake.open();
    socket.send({ action: 'record-choice', choice: '1' });
    socket.send({ action: 'record-choice', choice: '2' });
    socket.send({ action: 'reset' });

    expect(fake.sent.map((message) => JSON.parse(message))).toEqual([
      { action: 'record-choice', choice: '1' },
      { action: 'record-choice', choice: '2' },
      { action: 'reset' },
    ]);
    socket.close();
  });
});
