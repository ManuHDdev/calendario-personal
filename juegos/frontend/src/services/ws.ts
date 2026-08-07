import keycloak from './keycloak';

// Cliente WebSocket con reconexión automática — ver design.md "WebSocket
// room layer" y spec.md "Reconnection grace period" (~60s en el backend
// para conservar el rol/estado del jugador si reconecta a tiempo). El JWT
// viaja como query param (?token=), igual que storage lo hace para
// <img>/<video>, porque el WebSocket nativo del navegador no permite fijar
// cabeceras custom en el handshake.

export type WsMessage = { type: string; [key: string]: unknown };

export interface RoomSocketOptions {
  roomCode: string;
  onMessage: (message: WsMessage) => void;
  onStatusChange?: (status: 'connecting' | 'open' | 'reconnecting' | 'closed') => void;
  maxReconnectAttempts?: number;
}

export class RoomSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private closedByUser = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private opts: RoomSocketOptions) {}

  connect(): void {
    this.closedByUser = false;
    this.open();
  }

  private open(): void {
    const token = keycloak.token;
    if (!token) {
      this.opts.onStatusChange?.('closed');
      return;
    }

    this.opts.onStatusChange?.(this.reconnectAttempts === 0 ? 'connecting' : 'reconnecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/juegos/api/ws?token=${encodeURIComponent(
      token,
    )}&room=${encodeURIComponent(this.opts.roomCode)}`;

    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.opts.onStatusChange?.('open');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WsMessage;
        this.opts.onMessage(message);
      } catch {
        // Mensaje no JSON: se ignora silenciosamente (no debería ocurrir con este backend).
      }
    };

    ws.onclose = () => {
      if (this.closedByUser) {
        this.opts.onStatusChange?.('closed');
        return;
      }
      const maxAttempts = this.opts.maxReconnectAttempts ?? 10;
      if (this.reconnectAttempts >= maxAttempts) {
        this.opts.onStatusChange?.('closed');
        return;
      }
      this.reconnectAttempts += 1;
      // Backoff exponencial acotado — cabe holgadamente dentro del período
      // de gracia de 60s del backend para las primeras reconexiones.
      const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 10_000);
      this.reconnectTimer = setTimeout(() => this.open(), delay);
    };

    ws.onerror = () => {
      // onclose se dispara justo después; la reconexión se gestiona ahí.
    };
  }

  send(message: WsMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}
