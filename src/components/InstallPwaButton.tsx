"use client";

import { useEffect, useMemo, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isInStandaloneMode() {
  // Android/Chrome: display-mode
  const isStandaloneDisplay = window.matchMedia?.("(display-mode: standalone)")?.matches;
  // iOS Safari: navigator.standalone
  const isIOSStandalone = (navigator as any).standalone === true;
  return Boolean(isStandaloneDisplay || isIOSStandalone);
}

export default function InstallPwaButton() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const isIOS = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(ua);
  }, []);

  useEffect(() => {
    setInstalled(isInStandaloneMode());

    const onBeforeInstall = (e: Event) => {
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
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  if (installed) return null;

  const canPrompt = Boolean(promptEvent);

  async function handleInstall() {
    if (promptEvent) {
      await promptEvent.prompt();
      await promptEvent.userChoice;
      setPromptEvent(null);
      return;
    }

    // Sem evento (caso comum em http por IP / iOS / etc) -> mostrar ajuda
    setShowHelp(true);
    setTimeout(() => setShowHelp(false), 8000);
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
          style={{
            position: "fixed",
            bottom: 72,
            right: 16,
            maxWidth: 280,
            padding: 12,
            borderRadius: 12,
            background: "white",
            border: "1px solid #ddd",
            boxShadow: "0 10px 24px rgba(0,0,0,0.16)",
            zIndex: 1001,
            color: "#222",
            fontSize: 13,
            lineHeight: 1.3,
          }}
        >
          <strong>Instalação manual</strong>
          <div style={{ marginTop: 6 }}>
            {isIOS ? (
              <>
                No Safari: toque em <strong>Compartilhar</strong> → <strong>Adicionar à Tela de Início</strong>.
              </>
            ) : (
              <>
                No Chrome: toque em <strong>⋮</strong> → <strong>Adicionar à tela inicial</strong>.
                <div style={{ marginTop: 6, color: "#555" }}>
                  (Via IP/HTTP o botão automático pode não aparecer.)
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
