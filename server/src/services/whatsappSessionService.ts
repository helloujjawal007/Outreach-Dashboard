import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  type WASocket,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { whatsappAdapter } from '../adapters/whatsappAdapter';

export type WhatsAppConnectionStatus = 'disconnected' | 'connecting' | 'qr_ready' | 'connected';

export interface WhatsAppSessionState {
  status: WhatsAppConnectionStatus;
  phoneNumber: string | null;
  name: string | null;
  qrCodeDataUrl: string | null;
  rawQr: string | null;
  pairingCode: string | null;
  lastConnectedAt: string | null;
  lastError: string | null;
}

export class WhatsAppSessionService {
  private sock: WASocket | null = null;
  private sessionDir: string;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isExplicitDisconnect: boolean = false;
  private isStarting: boolean = false;

  private state: WhatsAppSessionState = {
    status: 'disconnected',
    phoneNumber: null,
    name: null,
    qrCodeDataUrl: null,
    rawQr: null,
    pairingCode: null,
    lastConnectedAt: null,
    lastError: null,
  };

  constructor() {
    this.sessionDir = path.resolve(process.cwd(), 'server/data/whatsapp_session');
    fs.mkdirSync(this.sessionDir, { recursive: true });
  }

  /**
   * Returns current WhatsApp socket state
   */
  getState(): WhatsAppSessionState {
    return { ...this.state };
  }

  /**
   * Check if credentials exist on disk
   */
  hasSavedSession(): boolean {
    try {
      const credsPath = path.join(this.sessionDir, 'creds.json');
      return fs.existsSync(credsPath) && fs.statSync(credsPath).size > 10;
    } catch {
      return false;
    }
  }

  /**
   * Initializes or restores the WhatsApp socket
   */
  async startSession(): Promise<WhatsAppSessionState> {
    if (this.sock && (this.state.status === 'connected' || this.state.status === 'qr_ready')) {
      return this.getState();
    }

    if (this.isStarting) {
      return this.getState();
    }

    this.isStarting = true;
    this.isExplicitDisconnect = false;
    this.state.status = 'connecting';
    this.state.lastError = null;

    try {
      const { state: authState, saveCreds } = await useMultiFileAuthState(this.sessionDir);

      const sock = makeWASocket({
        auth: {
          creds: authState.creds,
          keys: makeCacheableSignalKeyStore(authState.keys, pino({ level: 'silent' })),
        },
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['Outreach Dashboard', 'Chrome', '1.0.0'],
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
      });

      this.sock = sock;

      // Handle credentials update
      sock.ev.on('creds.update', saveCreds);

      // Handle connection updates
      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            this.state.rawQr = qr;
            this.state.qrCodeDataUrl = await QRCode.toDataURL(qr, {
              margin: 2,
              scale: 6,
              color: { dark: '#0f172a', light: '#ffffff' },
            });
            this.state.status = 'qr_ready';
            console.log('[WhatsApp Socket] New QR code generated for pairing');
          } catch (err: any) {
            console.error('[WhatsApp Socket] Failed to generate QR data URL:', err?.message);
          }
        }

        if (connection === 'open') {
          this.state.status = 'connected';
          this.state.qrCodeDataUrl = null;
          this.state.rawQr = null;
          this.state.pairingCode = null;
          this.state.lastConnectedAt = new Date().toISOString();
          this.state.lastError = null;

          const rawId = sock.user?.id || '';
          // WhatsApp JID format: 61412345678:1@s.whatsapp.net
          const digits = rawId.split(':')[0].split('@')[0];
          this.state.phoneNumber = digits ? `+${digits}` : null;
          this.state.name = sock.user?.name || null;

          console.log(`[WhatsApp Socket] Connected successfully! Account: ${this.state.phoneNumber || 'User'} (${this.state.name || 'Device'})`);
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut;

          console.log(`[WhatsApp Socket] Connection closed. Status code: ${statusCode}, isLoggedOut: ${isLoggedOut}`);

          if (this.isExplicitDisconnect) {
            this.cleanupSession();
            this.state.status = 'disconnected';
            this.state.phoneNumber = null;
            this.state.name = null;
            this.state.qrCodeDataUrl = null;
            this.state.rawQr = null;
            this.state.pairingCode = null;
            this.state.lastError = 'Disconnected by user';
          } else if (isLoggedOut) {
            this.state.status = 'disconnected';
            this.state.phoneNumber = null;
            this.state.name = null;
            this.state.lastError = 'Logged out from WhatsApp. Re-link your account in Settings.';
          } else {
            this.state.status = 'connecting';
            this.scheduleReconnect();
          }
        }
      });

      // Handle inbound messages
      sock.ev.on('messages.upsert', async ({ messages: incomingMsgs }) => {
        for (const m of incomingMsgs) {
          // Ignore outbound messages from us or status broadcast stories
          if (m.key.fromMe || m.key.remoteJid === 'status@broadcast') {
            continue;
          }

          const jid = m.key.remoteJid || '';
          // Focus on direct chat contacts (ends with @s.whatsapp.net)
          if (!jid.endsWith('@s.whatsapp.net')) {
            continue;
          }

          const fromPhone = jid.replace('@s.whatsapp.net', '');
          const messageContent =
            m.message?.conversation ||
            m.message?.extendedTextMessage?.text ||
            m.message?.imageMessage?.caption ||
            '';

          if (fromPhone && messageContent.trim()) {
            console.log(`[WhatsApp Inbound] Received message from +${fromPhone}: "${messageContent.slice(0, 60)}"`);
            try {
              await whatsappAdapter.handleInboundWebhook({
                fromPhone,
                text: messageContent.trim(),
                externalMessageId: m.key.id || undefined,
              });
            } catch (err) {
              console.error('[WhatsApp Inbound Handler Error]', err);
            }
          }
        }
      });

      this.isStarting = false;
      return this.getState();
    } catch (error: any) {
      this.isStarting = false;
      this.state.status = 'disconnected';
      this.state.lastError = error?.message || 'Failed to start WhatsApp session';
      console.error('[WhatsApp Socket Start Error]', error);
      return this.getState();
    }
  }

  /**
   * Schedules reconnection with backoff
   */
  private scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.reconnectTimer = setTimeout(() => {
      if (!this.isExplicitDisconnect) {
        console.log('[WhatsApp Socket] Attempting reconnect...');
        this.startSession().catch((err) => console.error('[WhatsApp Reconnect Error]', err));
      }
    }, 4000);
  }

  /**
   * Requests an 8-character pairing code for a given phone number
   */
  async requestPairingCode(phoneNumber: string): Promise<{ success: boolean; code?: string; error?: string }> {
    const cleanDigits = phoneNumber.replace(/\D/g, '');
    if (!cleanDigits || cleanDigits.length < 8) {
      return { success: false, error: 'Valid phone number with country code is required (e.g. 61412345678 or +61412345678)' };
    }

    try {
      if (!this.sock) {
        await this.startSession();
      }

      // Allow a brief moment if socket is spinning up
      let attempts = 0;
      while (!this.sock && attempts < 10) {
        await new Promise((r) => setTimeout(r, 500));
        attempts++;
      }

      if (!this.sock) {
        return { success: false, error: 'Socket failed to initialize' };
      }

      const code = await this.sock.requestPairingCode(cleanDigits);
      // Format 8-char code as ABCD-1234 for readability
      const formattedCode = code ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
      this.state.pairingCode = formattedCode;

      console.log(`[WhatsApp Socket] Pairing code generated for +${cleanDigits}: ${formattedCode}`);
      return { success: true, code: formattedCode };
    } catch (err: any) {
      console.error('[WhatsApp Pairing Code Error]', err);
      return { success: false, error: err?.message || 'Failed to request pairing code' };
    }
  }

  /**
   * Sends a direct WhatsApp message to a recipient phone number
   */
  async sendMessage(
    recipientPhone: string,
    text: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.sock || this.state.status !== 'connected') {
      return { success: false, error: 'WhatsApp session is not connected. Link your phone first.' };
    }

    let cleanDigits = recipientPhone.replace(/\D/g, '');

    // Convert Australian leading 04xx to 614xx
    if (cleanDigits.startsWith('04') && cleanDigits.length === 10) {
      cleanDigits = '61' + cleanDigits.slice(1);
    } else if (cleanDigits.length === 10 && !cleanDigits.startsWith('1')) {
      // 10 digits without international country prefix: default to North American 1...
      cleanDigits = '1' + cleanDigits;
    }

    if (!cleanDigits || cleanDigits.length < 8) {
      return { success: false, error: `Invalid recipient phone number: ${recipientPhone}` };
    }

    try {
      // 1. Verify if the recipient is registered on WhatsApp
      let onWaList: { jid: string; exists: boolean }[] | undefined;
      try {
        onWaList = await this.sock.onWhatsApp(cleanDigits);
      } catch (checkErr) {
        console.warn(`[WhatsApp onWhatsApp Warning for ${cleanDigits}]`, checkErr);
      }

      const onWa = onWaList && onWaList.length > 0 ? onWaList[0] : null;
      if (!onWa || !onWa.exists) {
        console.warn(`[WhatsApp Send] +${cleanDigits} is not registered on WhatsApp`);
        return {
          success: false,
          error: `Phone number +${cleanDigits} is not registered on WhatsApp (landline or inactive number).`,
        };
      }

      const jid = onWa.jid || `${cleanDigits}@s.whatsapp.net`;
      const result = await this.sock.sendMessage(jid, { text });
      const messageId = result?.key?.id || undefined;
      return { success: true, messageId };
    } catch (err: any) {
      console.error(`[WhatsApp Send Error to ${recipientPhone}]`, err);
      return { success: false, error: err?.message || 'WhatsApp message dispatch failed' };
    }
  }

  /**
   * Disconnects current socket and purges session auth tokens from disk
   */
  async disconnect(): Promise<void> {
    this.isExplicitDisconnect = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.sock) {
      try {
        await this.sock.logout();
      } catch {
        try {
          this.sock.end(undefined);
        } catch {}
      }
      this.sock = null;
    }

    this.cleanupSession();

    this.state = {
      status: 'disconnected',
      phoneNumber: null,
      name: null,
      qrCodeDataUrl: null,
      rawQr: null,
      pairingCode: null,
      lastConnectedAt: null,
      lastError: null,
    };

    console.log('[WhatsApp Socket] Session successfully disconnected and cleared');
  }

  /**
   * Automatically restores session on server startup if credentials exist
   */
  async autoRestoreSession(): Promise<void> {
    if (this.hasSavedSession()) {
      console.log('[WhatsApp Socket] Saved session found. Auto-restoring WhatsApp connection...');
      await this.startSession();
    } else {
      console.log('[WhatsApp Socket] No saved WhatsApp session. Ready for QR or pairing code linking.');
    }
  }

  /**
   * Purges multi-file auth credentials folder
   */
  private cleanupSession(): void {
    try {
      if (fs.existsSync(this.sessionDir)) {
        const files = fs.readdirSync(this.sessionDir);
        for (const file of files) {
          fs.rmSync(path.join(this.sessionDir, file), { recursive: true, force: true });
        }
      }
    } catch (err) {
      console.error('[WhatsApp Cleanup Error]', err);
    }
  }
}

export const whatsappSessionService = new WhatsAppSessionService();
