"use client";

import { useEffect } from "react";

export default function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Evita SW em dev para não causar cache “fantasma”
    if (process.env.NODE_ENV !== "production") return;

    let cancelled = false;

    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });

        // tenta puxar update após registrar
        reg.update().catch(() => {});

        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;

          installing.addEventListener("statechange", () => {
            if (cancelled) return;

            if (installing.state === "installed") {
              // Se já existia um SW controlando, houve update.
              // Por enquanto, fica silencioso para não atrapalhar.
              if (navigator.serviceWorker.controller) {
                // futuramente: mostrar toast "Nova versão disponível"
              }
            }
          });
        });
      } catch {
        // silencioso por estabilidade
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
