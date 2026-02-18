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

type Props = {
  /** true = botão dentro do card (largura 100%). false = botão flutuante. */
  inline?: boolean;
  /** opcional: esconder o botão flutuante em páginas específicas */
  forceHide?: boolean;
};

export default function InstallPwaButton({ inline = false, forceHide = false }: Props) {
  const [mounted, setMounted] = useState(false);

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
    setMounted(true);

    // Só calcula isso no client pra não dar mismatch
    setInstalled(isInStandaloneMode());

    const mm = window.matchMedia?.("(display-mode: standalone)");
    const onDisplayModeChange = () => setInstalled(isInStandaloneMode());
    mm?.addEventListener?.("change", onDisplayModeChange);

    const onBeforeInstall = (e: Event) => {
      // Android/Chrome dispara esse evento quando o app é "instalável"
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

  // Evita hydration mismatch: no SSR sempre renderiza null
  if (!mounted) return null;

  if (forceHide) return null;
  if (!canShowInstallUI) return null;
  if (installed) return null;

  const canPrompt = Boolean(promptEvent);

  async function handleInstall() {
    // Se existir o prompt do navegador (Android/Chrome), instala de verdade
    if (promptEvent) {
      try {
        await promptEvent.prompt();
        await promptEvent.userChoice;
      } finally {
        setPromptEvent(null);
      }
      return;
    }

    // Sem prompt (iOS ou Android ainda não elegível) -> ajuda
    setShowHelp(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setShowHelp(false), 12000);
  }

  function closeHelp() {
    setShowHelp(false);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
  }

  // Estilos do botão
  const buttonStyle: React.CSSProperties = inline
    ? {
        width: "100%",
        height: 44,
        borderRadius: 12,
        border: "1px solid rgba(0,0,0,0.12)",
        background: canPrompt ? "#2E7D32" : "#fff",
        color: canPrompt ? "#fff" : "#111",
        fontWeight: 800,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }
    : {
        position: "fixed",
        bottom: 16,
        right: 16,
        padding: "12px 14px",
        borderRadius: 12,
        backgroundColor: canPrompt ? "#2E7D32" : "#ffffff",
        color: canPrompt ? "#fff" : "#111",
        fontWeight: 800,
        border: "1px solid rgba(0,0,0,0.12)",
        boxShadow: "0 8px 18px rgba(0,0,0,0.18)",
        zIndex: 1000,
        cursor: "pointer",
      };

  return (
    <>
      <button onClick={handleInstall} style={buttonStyle} title={canPrompt ? "Instalar PlantaCheck" : "Instalar app"}>
        📲 <span>Instalar app</span>
      </button>

      {showHelp && (
        <div
          role="dialog"
          aria-label="Ajuda para instalar o app"
          style={{
            position: "fixed",
            bottom: inline ? 120 : 72,
            right: 16,
            left: inline ? 16 : "auto",
            maxWidth: inline ? 520 : 320,
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
              </>
            )}
            <div style={{ marginTop: 8, color: "#666" }}>
              {canPrompt
                ? "Seu navegador já permite instalação automática."
                : "Se este botão não abriu o instalador automático, é porque o navegador ainda não liberou o prompt (ou você está no iOS)."}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
