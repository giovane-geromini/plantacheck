"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        setStatus("Lendo retorno do Supabase...");

        const code = sp.get("code");

        const hp = parseHashParams();
        const access_token = hp.get("access_token");
        const refresh_token = hp.get("refresh_token");

        if (code) {
          setStatus("Confirmando sessão (PKCE code)...");
          const { error } = await supabaseBrowser.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (access_token && refresh_token) {
          setStatus("Confirmando sessão (tokens no hash)...");
          const { error } = await supabaseBrowser.auth.setSession({ access_token, refresh_token });
          if (error) throw error;
        } else {
          setStatus("Nenhum code/token no URL. Tentando ler sessão existente...");
        }

        // limpa URL (remove code/tokens)
        try {
          const cleanUrl = `${window.location.origin}/auth/callback`;
          window.history.replaceState({}, "", cleanUrl);
        } catch {}

        setStatus("Carregando sessão...");
        const { data: sessData, error: sessErr } = await supabaseBrowser.auth.getSession();
        if (sessErr) throw sessErr;

        const session = sessData?.session;
        if (!session?.user) {
          setStatus("Sessão não encontrada. Voltando para /login...");
          router.replace("/login");
          return;
        }

        const user = session.user;

        setStatus("Preparando seu acesso...");
        const { error: upsertErr } = await supabaseBrowser
          .from("user_security")
          .upsert({ user_id: user.id }, { onConflict: "user_id" });

        if (upsertErr) throw upsertErr;

        setStatus("Verificando se já existe senha...");
        const { data: sec, error: secErr } = await supabaseBrowser
          .from("user_security")
          .select("password_set")
          .eq("user_id", user.id)
          .maybeSingle();

        if (secErr) throw secErr;

        if (!sec?.password_set) {
          setStatus("Primeiro acesso: indo para definir senha...");
          router.replace("/set-password");
          return;
        }

        setStatus("Senha já definida: indo para o app...");
        router.replace("/");
      } catch (e: any) {
        const msg = e?.message ?? "Erro no callback. Voltando para /login...";
        if (!cancelled) setStatus(msg);
        setTimeout(() => router.replace("/login"), 900);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border bg-white p-5 shadow-sm">
        <h1 className="text-lg font-semibold">Confirmando login…</h1>
        <p className="mt-2 text-sm text-gray-600">{status}</p>
      </div>
    </div>
  );
}
