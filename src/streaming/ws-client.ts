import type { Logger } from 'pino';
import WebSocket from 'ws';
import type { WsMarketEvent } from './types.js';

const PING_INTERVAL_MS = 10_000;
const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

export interface WsClientOptions {
  onEvents: (events: WsMarketEvent[]) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

export class WsClient {
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = INITIAL_BACKOFF_MS;
  private stopped = false;

  constructor(
    private readonly url: string,
    private readonly options: WsClientOptions,
    private readonly log: Logger,
  ) {}

  connect(): void {
    if (this.stopped) return;

    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      this.reconnectDelay = INITIAL_BACKOFF_MS;
      this.log.info({ url: this.url }, 'ws:connected');
      this.startPing();
      this.options.onConnected?.();
    });

    this.ws.on('message', (data) => {
      const raw = data.toString();
      if (raw === 'PONG') return;
      try {
        const parsed: unknown = JSON.parse(raw);
        const events: WsMarketEvent[] = Array.isArray(parsed)
          ? (parsed as WsMarketEvent[])
          : [parsed as WsMarketEvent];
        this.options.onEvents(events);
      } catch {
        this.log.debug({ raw: raw.slice(0, 200) }, 'ws:unparseable_message');
      }
    });

    this.ws.on('error', (err) => {
      this.log.warn({ err: err.message }, 'ws:error');
    });

    this.ws.on('close', (code, reason) => {
      this.stopPing();
      this.log.warn({ code, reason: reason.toString() }, 'ws:closed');
      this.options.onDisconnected?.();
      this.scheduleReconnect();
    });
  }

  send(data: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  disconnect(): void {
    this.stopped = true;
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      this.send('PING');
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.log.info({ delayMs: this.reconnectDelay }, 'ws:reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_BACKOFF_MS);
      this.connect();
    }, this.reconnectDelay);
  }
}
