// src/app/SwRegister.tsx
"use client";

import { useEffect } from "react";

export default function SwRegister() {
  useEffect(() => {
    // ✅ NUNCA registrar SW em dev (impede cache fantasma)
    if (process.env.NODE_ENV !== "production") return;

    // ✅ segurança extra
    if (typeof window === "undefined") return;
    if (typeof navigator === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    (async () => {
      try {
        // tenta remover SW antigos antes de registrar de novo
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const r of regs) await r.unregister();
        } catch {}

        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });

        // tenta atualizar, sem quebrar
        try {
          await reg.update();
        } catch {}

        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;

          installing.addEventListener("statechange", () => {
            if (cancelled) return;

            if (installing.state === "installed") {
              // se já existia SW controlando, houve update
              if (navigator.serviceWorker.controller) {
                // futuro: toast "Nova versão disponível"
              }
            }
          });
        });
      } catch {
        // silencioso
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
