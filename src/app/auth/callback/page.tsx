"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export const dynamic = "force-dynamic";

function parseHashParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  const hash = window.location.hash?.startsWith("#") ? window.location.hash.slice(1) : "";
  return new URLSearchParams(hash);
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const [status, setStatus] = useState("Iniciando callback...");

  // Lê o code uma vez (evita depender do sp dentro do effect)
  const codeFromQuery = useMemo(() => sp.get("code"), [sp]);

  useEffect(() => {
    let cancelled = false;

    const safeSetStatus = (text: string) => {
      if (!cancelled) setStatus(text);
    };

    const run = async () => {
      try {
        safeSetStatus("Lendo retorno do Supabase...");

        const code = codeFromQuery;

        // fallback para provedores/fluxos que retornam tokens no hash
        const hp = parseHashParams();
        const access_token = hp.get("access_token");
        const refresh_token = hp.get("refresh_token");

        if (code) {
          safeSetStatus("Confirmando sessão (PKCE code)...");
          const { error } = await supabaseBrowser.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (access_token && refresh_token) {
          safeSetStatus("Confirmando sessão (tokens no hash)...");
          const { error } = await supabaseBrowser.auth.setSession({ access_token, refresh_token });
          if (error) throw error;
        } else {
          safeSetStatus("Nenhum code/token no URL. Tentando ler sessão existente...");
        }

        // limpa URL (remove code/tokens) para evitar reprocessar em refresh
        try {
          const cleanUrl = `${window.location.origin}/auth/callback`;
          window.history.replaceState({}, "", cleanUrl);
        } catch {}

        safeSetStatus("Carregando sessão...");
        const { data: sessData, error: sessErr } = await supabaseBrowser.auth.getSession();
        if (sessErr) throw sessErr;

        const session = sessData?.session;
        if (!session?.user) {
          safeSetStatus("Sessão não encontrada. Voltando para /login...");
          router.replace("/login");
          return;
        }

        const user = session.user;

        safeSetStatus("Preparando seu acesso...");
        // garante registro na tabela (se você estiver usando essa tabela)
        const { error: upsertErr } = await supabaseBrowser
          .from("user_security")
          .upsert({ user_id: user.id }, { onConflict: "user_id" });

        if (upsertErr) throw upsertErr;

        safeSetStatus("Verificando se já existe senha...");
        const { data: sec, error: secErr } = await supabaseBrowser
          .from("user_security")
          .select("password_set")
          .eq("user_id", user.id)
          .maybeSingle();

        if (secErr) throw secErr;

        if (!sec?.password_set) {
          safeSetStatus("Primeiro acesso: indo para definir senha...");
          router.replace("/set-password");
          return;
        }

        safeSetStatus("Senha já definida: indo para o app...");
        router.replace("/");
      } catch (e: any) {
        const msg = e?.message ?? "Erro no callback. Voltando para /login...";
        safeSetStatus(msg);
        setTimeout(() => router.replace("/login"), 900);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [codeFromQuery, router]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border bg-white p-5 shadow-sm">
        <h1 className="text-lg font-semibold">Confirmando login…</h1>
        <p className="mt-2 text-sm text-gray-600">{status}</p>
      </div>
    </div>
  );
}
