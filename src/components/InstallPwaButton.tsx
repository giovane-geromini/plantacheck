"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isInStandaloneMode() {
  const isStandaloneDisplay = window.matchMedia?.("(display-mode: standalone)")?.matches;
  const isIOSStandalone = (navigator as any).standalone === true;
  return Boolean(isStandaloneDisplay || isIOSStandalone);
}

function isSecureContextForPWA() {
  if (typeof window === "undefined") return false;
  if (window.isSecureContext) return true;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

export default function InstallPwaButton() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const hideTimerRef = useRef<number | null>(null);

  const isIOS = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(ua);
  }, []);

  const canShowInstallUI = useMemo(() => {
    if (typeof window === "undefined") return false;
    const inIframe = window.self !== window.top;
    if (inIframe) return false;
    return true;
  }, []);

  useEffect(() => {
    setInstalled(isInStandaloneMode());

    const mm = window.matchMedia?.("(display-mode: standalone)");
    const onDisplayModeChange = () => setInstalled(isInStandaloneMode());
    mm?.addEventListener?.("change", onDisplayModeChange);

    const onBeforeInstall = (e: Event) => {
      if (!isSecureContextForPWA()) return;
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
      setShowHelp(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      mm?.removeEventListener?.("change", onDisplayModeChange);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onAppInstalled);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  if (!canShowInstallUI || installed) return null;

  const canPrompt = Boolean(promptEvent);

  async function handleInstall() {
    if (promptEvent) {
      try {
        await promptEvent.prompt();
        await promptEvent.userChoice;
      } finally {
        setPromptEvent(null);
      }
      return;
    }

    setShowHelp(true);

    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setShowHelp(false), 12000);
  }

  function closeHelp() {
    setShowHelp(false);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
  }

  return (
    <>
      <button
        onClick={handleInstall}
        style={{
          position: "fixed",
          bottom: 16,
          right: 16,
          padding: "12px 14px",
          borderRadius: 12,
          backgroundColor: "#2E7D32",
          color: "#fff",
          fontWeight: 700,
          border: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 8px 18px rgba(0,0,0,0.18)",
          zIndex: 1000,
          cursor: "pointer",
        }}
        title={canPrompt ? "Instalar PlantaCheck" : "Como instalar"}
      >
        📲 Instalar App
      </button>

      {showHelp && (
        <div
          role="dialog"
          aria-label="Ajuda para instalar o app"
          style={{
            position: "fixed",
            bottom: 72,
            right: 16,
            maxWidth: 300,
            padding: 12,
            borderRadius: 12,
            background: "white",
            border: "1px solid #ddd",
            boxShadow: "0 10px 24px rgba(0,0,0,0.16)",
            zIndex: 1001,
            color: "#222",
            fontSize: 13,
            lineHeight: 1.35,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <strong>Instalação manual</strong>
            <button
              onClick={closeHelp}
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
                color: "#444",
              }}
              aria-label="Fechar"
              title="Fechar"
            >
              ✕
            </button>
          </div>

          <div style={{ marginTop: 8 }}>
            {isIOS ? (
              <>
                No <strong>Safari</strong>: toque em <strong>Compartilhar</strong> →{" "}
                <strong>Adicionar à Tela de Início</strong>.
              </>
            ) : (
              <>
                No <strong>Chrome</strong>: toque em <strong>⋮</strong> →{" "}
                <strong>Adicionar à tela inicial</strong>.
                {!isSecureContextForPWA() && (
                  <div style={{ marginTop: 8, color: "#555" }}>
                    Dica: a instalação automática costuma exigir <strong>HTTPS</strong>. (No seu domínio já é HTTPS.)
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
