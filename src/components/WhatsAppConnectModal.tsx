import { useState, useEffect, useCallback, useRef } from 'react';
import { Modal } from './Modal';
import { api } from '@/services/api';
import type { WhatsAppSessionStatus } from '@/types';
import {
  MessageCircle,
  QrCode,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Unlink,
  Send,
  Copy,
  Check,
} from 'lucide-react';

interface WhatsAppConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStatusChange?: (status: WhatsAppSessionStatus) => void;
}

export function WhatsAppConnectModal({
  isOpen,
  onClose,
  onStatusChange,
}: WhatsAppConnectModalProps) {
  const [waStatus, setWaStatus] = useState<WhatsAppSessionStatus | null>(null);
  const [activeTab, setActiveTab] = useState<'qr' | 'pairing'>('qr');
  const [phoneInput, setPhoneInput] = useState('');
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [isRequestingPairing, setIsRequestingPairing] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Quick Test Message State
  const [showTestMessage, setShowTestMessage] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testText, setTestText] = useState('Hello from Outreach Dashboard! WhatsApp automation is successfully connected.');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testSuccess, setTestSuccess] = useState<string | null>(null);

  const prevConnectedRef = useRef(false);

  // Load status and auto-start socket if disconnected
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    const init = async () => {
      try {
        const status = await api.getWhatsAppSessionStatus();
        if (!isMounted) return;
        setWaStatus(status);
        onStatusChange?.(status);

        if (status.status === 'disconnected') {
          const started = await api.startWhatsAppSession();
          if (!isMounted) return;
          setWaStatus(started);
          onStatusChange?.(started);
        }
      } catch (err: any) {
        if (!isMounted) return;
        setErrorMessage(err?.message || 'Failed to initialize WhatsApp connection');
      }
    };

    init();

    // Polling loop while modal is open to capture QR and connection events in real time
    const pollInterval = setInterval(async () => {
      try {
        const current = await api.getWhatsAppSessionStatus();
        if (!isMounted) return;
        setWaStatus(current);
        onStatusChange?.(current);

        if (current.pairingCode) {
          setPairingCode(current.pairingCode);
        }

        // Detect newly connected transition
        if (current.isConnected && !prevConnectedRef.current) {
          prevConnectedRef.current = true;
          setErrorMessage(null);
        } else if (!current.isConnected) {
          prevConnectedRef.current = false;
        }
      } catch (_) {}
    }, 2500);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, [isOpen, onStatusChange]);

  // Restart / Refresh QR code
  const handleRefreshSession = useCallback(async () => {
    setIsRefreshing(true);
    setErrorMessage(null);
    try {
      const refreshed = await api.startWhatsAppSession();
      setWaStatus(refreshed);
      onStatusChange?.(refreshed);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to refresh WhatsApp session');
    } finally {
      setIsRefreshing(false);
    }
  }, [onStatusChange]);

  // Request 8-Digit Pairing Code
  const handleRequestPairing = useCallback(async () => {
    const cleanPhone = phoneInput.replace(/[^\d+]/g, '').trim();
    if (!cleanPhone || cleanPhone.length < 8) {
      setErrorMessage('Please enter a valid WhatsApp phone number with country code (e.g. +1 555 123 4567 or +91 98765 43210)');
      return;
    }

    setIsRequestingPairing(true);
    setErrorMessage(null);
    try {
      const res = await api.requestWhatsAppPairing(cleanPhone);
      if (res.success && res.pairingCode) {
        setPairingCode(res.pairingCode);
      } else {
        setErrorMessage(res.message || 'Failed to generate pairing code');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error generating pairing code');
    } finally {
      setIsRequestingPairing(false);
    }
  }, [phoneInput]);

  // Disconnect active session
  const handleDisconnect = useCallback(async () => {
    const confirm = window.confirm('Are you sure you want to disconnect this WhatsApp account? Automated dispatches from this number will pause until reconnected.');
    if (!confirm) return;

    setIsDisconnecting(true);
    setErrorMessage(null);
    try {
      await api.disconnectWhatsAppSession();
      const updated = await api.getWhatsAppSessionStatus();
      setWaStatus(updated);
      onStatusChange?.(updated);
      setPairingCode(null);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to disconnect WhatsApp session');
    } finally {
      setIsDisconnecting(false);
    }
  }, [onStatusChange]);

  // Copy pairing code to clipboard
  const handleCopyPairingCode = () => {
    if (!pairingCode) return;
    navigator.clipboard.writeText(pairingCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  // Send Direct Test Message
  const handleSendTestMessage = async () => {
    const cleanPhone = testPhone.replace(/[^\d+]/g, '').trim();
    if (!cleanPhone || cleanPhone.length < 8) {
      setErrorMessage('Please enter a valid recipient phone number with country code');
      return;
    }
    if (!testText.trim()) {
      setErrorMessage('Please enter message text to send');
      return;
    }

    setIsSendingTest(true);
    setErrorMessage(null);
    setTestSuccess(null);
    try {
      const res = await api.sendDirectWhatsApp({
        recipientPhone: cleanPhone,
        text: testText.trim(),
      });
      if (res.success) {
        setTestSuccess(`Message delivered! (ID: ${res.messageId || 'sent'})`);
        setTimeout(() => setTestSuccess(null), 6000);
      } else {
        setErrorMessage('Failed to send test message');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to send test message');
    } finally {
      setIsSendingTest(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Connect WhatsApp Automation"
      width="lg"
    >
      <div className="space-y-4">
        {/* Error Notification */}
        {errorMessage && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2.5">
            <AlertTriangle size={15} className="shrink-0 text-rose-600 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold block">Connection Alert</span>
              <span>{errorMessage}</span>
            </div>
          </div>
        )}

        {/* State 1: CONNECTED */}
        {waStatus?.isConnected ? (
          <div className="space-y-4">
            <div className="rounded-2xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 via-teal-50/30 to-white p-6 text-center space-y-3 shadow-2xs">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white mx-auto shadow-md">
                <CheckCircle2 size={32} />
              </div>

              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 mb-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Live WhatsApp Socket Connected
                </span>
                <h3 className="text-xl font-black text-emerald-950 font-mono">
                  {waStatus.phoneNumber || 'Connected Account'}
                </h3>
                {waStatus.name && (
                  <p className="text-xs font-medium text-emerald-700 mt-0.5">
                    Account / Device: <strong>{waStatus.name}</strong>
                  </p>
                )}
                {waStatus.lastConnectedAt && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Connected since: {new Date(waStatus.lastConnectedAt).toLocaleString()}
                  </p>
                )}
              </div>

              <p className="text-xs text-emerald-900/80 max-w-md mx-auto leading-relaxed pt-1">
                Your WhatsApp phone is linked directly to the Outreach Dashboard engine. Single messages, slot sender dispatches, and multi-touch sequences will send 100% automatically in headless background mode.
              </p>
            </div>

            {/* Features summary grid */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <span className="font-bold text-slate-900 block mb-1">Two-Way Reply Sync</span>
                <p className="text-slate-500 text-[11px] leading-relaxed">
                  Incoming replies from prospects automatically appear in the Messages center and update CRM lead stages.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <span className="font-bold text-slate-900 block mb-1">Automated Slot Sender</span>
                <p className="text-slate-500 text-[11px] leading-relaxed">
                  WhatsApp cold touch outreach executes smoothly through the 5-slot sender engine with humanized intervals.
                </p>
              </div>
            </div>

            {/* Collapsible Test Message Section */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowTestMessage(!showTestMessage)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 transition"
              >
                <div className="flex items-center gap-2">
                  <Send size={13} className="text-emerald-600" />
                  <span>Send a Quick Test Message</span>
                </div>
                <span className="text-[11px] text-slate-400 font-normal">
                  {showTestMessage ? 'Hide' : 'Verify delivery'}
                </span>
              </button>

              {showTestMessage && (
                <div className="p-4 space-y-3 bg-white border-t border-slate-200">
                  {testSuccess && (
                    <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-semibold flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                      <span>{testSuccess}</span>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 uppercase">Recipient Phone (with Country Code)</label>
                    <input
                      type="tel"
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      placeholder="+1 555 123 4567 or your own mobile number"
                      className="input text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 uppercase">Message Text</label>
                    <textarea
                      value={testText}
                      onChange={(e) => setTestText(e.target.value)}
                      rows={2}
                      className="input text-xs resize-none"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleSendTestMessage}
                    disabled={isSendingTest || !testPhone.trim()}
                    className="btn-primary text-xs py-1.5 px-4 font-bold flex items-center gap-1.5"
                  >
                    {isSendingTest ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                    <span>{isSendingTest ? 'Sending...' : 'Send Test WhatsApp'}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="btn-danger py-1.5 px-4 text-xs font-semibold flex items-center gap-1.5"
              >
                <Unlink size={14} />
                <span>{isDisconnecting ? 'Disconnecting...' : 'Disconnect Account'}</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="btn-primary py-1.5 px-6 text-xs font-bold"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* State 2: NOT CONNECTED (Scan QR or Enter Pairing Code) */
          <div className="space-y-4">
            {/* Mode Switcher */}
            <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveTab('qr')}
                className={`py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${
                  activeTab === 'qr'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <QrCode size={15} className="text-emerald-600" />
                <span>Option 1: Scan QR Code</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('pairing')}
                className={`py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${
                  activeTab === 'pairing'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Smartphone size={15} className="text-indigo-600" />
                <span>Option 2: 8-Digit Pairing Code</span>
              </button>
            </div>

            {activeTab === 'qr' ? (
              /* TAB 1: SCAN QR CODE */
              <div className="space-y-4 text-center">
                <div className="flex flex-col items-center justify-center p-6 rounded-2xl border border-slate-200 bg-white shadow-xs">
                  {waStatus?.qrCodeDataUrl ? (
                    <div className="space-y-3">
                      <div className="p-3 bg-white rounded-2xl border-2 border-emerald-500/80 shadow-md inline-block">
                        <img
                          src={waStatus.qrCodeDataUrl}
                          alt="Scan WhatsApp QR Code"
                          className="w-64 h-64 rounded-xl object-contain"
                        />
                      </div>
                      <div className="text-xs font-bold text-emerald-800 flex items-center justify-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping" />
                        <span>Live QR Ready — Scan with your phone now</span>
                      </div>
                    </div>
                  ) : (
                    <div className="w-64 h-64 flex flex-col items-center justify-center gap-3 bg-slate-50 rounded-2xl border border-slate-200 text-slate-400">
                      <Loader2 size={36} className="animate-spin text-emerald-600" />
                      <div className="text-center px-4">
                        <span className="text-xs font-bold text-slate-800 block">
                          Initializing WhatsApp Engine...
                        </span>
                        <span className="text-[11px] text-slate-500 mt-1 block">
                          Generating secure session token and QR code
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Instructions */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-left text-xs space-y-2">
                  <span className="font-bold text-slate-900 block text-xs">
                    How to scan and link WhatsApp:
                  </span>
                  <ol className="list-decimal list-inside space-y-1 text-slate-600 text-[11.5px] leading-relaxed">
                    <li>Open <strong>WhatsApp</strong> on your mobile phone</li>
                    <li>
                      Go to <strong>Settings</strong> (iPhone) or tap the <strong>⋮ Menu</strong> (Android)
                    </li>
                    <li>
                      Tap <strong>Linked Devices</strong> &rarr; <strong>Link a Device</strong>
                    </li>
                    <li>
                      Point your phone camera at the QR code above to establish the connection
                    </li>
                  </ol>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={handleRefreshSession}
                    disabled={isRefreshing}
                    className="btn-secondary py-1.5 px-3.5 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
                    <span>{isRefreshing ? 'Refreshing...' : 'Refresh QR Code'}</span>
                  </button>

                  <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Auto-detects scan in real time
                  </span>
                </div>
              </div>
            ) : (
              /* TAB 2: PAIRING CODE */
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 block">
                    Your WhatsApp Phone Number (with Country Code)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      placeholder="e.g. +1 555 123 4567 or +91 98765 43210"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      className="input text-xs flex-1 bg-white font-mono"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRequestPairing();
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleRequestPairing}
                      disabled={isRequestingPairing || !phoneInput.trim()}
                      className="btn-primary py-2 px-4 text-xs font-bold flex items-center gap-1.5 shrink-0"
                    >
                      {isRequestingPairing ? (
                        <>
                          <Loader2 size={13} className="animate-spin" />
                          <span>Generating...</span>
                        </>
                      ) : (
                        <>
                          <Smartphone size={13} />
                          <span>Get Code</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Use full international format starting with <code>+</code>.
                  </p>
                </div>

                {pairingCode ? (
                  <div className="p-5 rounded-2xl border-2 border-indigo-200 bg-indigo-50/50 text-center space-y-3">
                    <span className="text-xs font-bold text-indigo-900 block">
                      Enter this code in WhatsApp on your phone:
                    </span>
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-3xl font-black font-mono tracking-widest text-indigo-950 bg-white px-5 py-2.5 rounded-xl border border-indigo-200 shadow-xs select-all">
                        {pairingCode}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyPairingCode}
                        className="btn-secondary py-2.5 px-3 rounded-xl text-xs flex items-center gap-1.5 font-bold"
                        title="Copy code"
                      >
                        {copiedCode ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
                        <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>

                    <ol className="list-decimal list-inside text-left text-xs text-indigo-900/80 space-y-1 max-w-sm mx-auto pt-2 text-[11px]">
                      <li>Open WhatsApp &gt; <strong>Linked Devices</strong></li>
                      <li>Tap <strong>Link with phone number instead</strong></li>
                      <li>Type the 8-character code shown above</li>
                    </ol>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 space-y-1.5">
                    <span className="font-bold text-slate-800 block">
                      Pairing without camera:
                    </span>
                    <p className="text-[11.5px] leading-relaxed">
                      If you cannot scan the QR code using your camera, enter your phone number above. WhatsApp will generate an 8-character code that you can type directly into WhatsApp under <em>Link with phone number instead</em>.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
