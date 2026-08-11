import {
  isRegistrationMessage,
  messageError,
  parseServerMessage,
  type ClientMessage,
  type ServerMessage,
} from '../protocol';

const IDENTITY_KEY = 'name';
const RECONNECT_DELAY_MS = 1_000;

type RegistrationResult = (success: boolean, error?: string) => void;

export interface PlanningPokerSocketOptions {
  readonly url: string;
  readonly onConnectionChange: (connected: boolean) => void;
  readonly onMessage: (message: ServerMessage) => void;
  readonly createWebSocket?: (url: string) => WebSocket;
  readonly storage?: Storage;
}

export function planningPokerSocketUrl(location: Location = window.location): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const path = import.meta.env.PROD ? '/sprint-planning-poker/ws' : '/api/ws';
  return `${protocol}//${location.host}${path}`;
}

export class PlanningPokerSocket {
  private readonly options: PlanningPokerSocketOptions;
  private readonly createWebSocket: (url: string) => WebSocket;
  private readonly storage: Storage;
  private socket?: WebSocket;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private registrationResult?: RegistrationResult;
  private registered = false;
  private stopped = false;

  public constructor(options: PlanningPokerSocketOptions) {
    this.options = options;
    this.createWebSocket = options.createWebSocket ?? ((url) => new WebSocket(url));
    this.storage = options.storage ?? window.localStorage;
    this.storage.removeItem(IDENTITY_KEY);
    this.connect();
  }

  public register(name: string, observer: boolean, result: RegistrationResult): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      result(false);
      return;
    }

    this.storage.setItem(IDENTITY_KEY, name);
    this.registrationResult = result;
    this.send({ action: 'register', name, observer });
  }

  public send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  public close(): void {
    this.finishRegistration(false, 'connection lost, please try again');
    this.stopped = true;
    this.registered = false;
    this.storage.removeItem(IDENTITY_KEY);
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.socket?.close();
    this.socket = undefined;
  }

  private finishRegistration(success: boolean, error?: string): void {
    const result = this.registrationResult;
    this.registrationResult = undefined;
    result?.(success, error);
  }

  private connect(): void {
    if (this.stopped) {
      return;
    }

    const socket = this.createWebSocket(this.options.url);
    this.socket = socket;

    socket.addEventListener('open', () => {
      if (socket !== this.socket || this.stopped) {
        return;
      }
      this.options.onConnectionChange(true);
      if (this.registered) {
        const name = this.storage.getItem(IDENTITY_KEY);
        if (name) {
          this.send({ action: 'register', name });
        }
      }
    });

    socket.addEventListener('message', (event: MessageEvent<string>) => {
      if (socket !== this.socket || this.stopped) {
        return;
      }
      const message = parseServerMessage(event.data);
      if (!message) {
        return;
      }

      if (!this.registered && isRegistrationMessage(message)) {
        const error = messageError(message);
        if (error) {
          this.storage.removeItem(IDENTITY_KEY);
          this.finishRegistration(false, error);
        } else {
          this.registered = true;
          this.finishRegistration(true);
        }
      }

      this.options.onMessage(message);
    });

    socket.addEventListener('error', () => {
      if (socket !== this.socket || this.stopped) {
        return;
      }
      this.finishRegistration(false, 'connection lost, please try again');
      if (socket.readyState !== WebSocket.CLOSED) {
        socket.close();
      }
    });

    socket.addEventListener('close', () => {
      if (socket !== this.socket || this.stopped) {
        return;
      }
      this.finishRegistration(false, 'connection lost, please try again');
      this.options.onConnectionChange(false);
      this.socket = undefined;
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = undefined;
        this.connect();
      }, RECONNECT_DELAY_MS);
    });
  }
}
