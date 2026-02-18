"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

function parseHashParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  const hash = window.location.hash?.startsWith("#") ? window.location.hash.slice(1) : "";
  return new URLSearchParams(hash);
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const [status, setStatus] = useState("Carregando...");
  const [ready, setReady] = useState(false);

  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const codeFromQuery = useMemo(() => sp.get("code"), [sp]);

  useEffect(() => {
    let cancelled = false;
    const safeSet = (fn: () => void) => {
      if (!cancelled) fn();
    };

    const run = async () => {
      try {
        safeSet(() => {
          setErr(null);
          setMsg(null);
          setReady(false);
          setStatus("Validando link de redefinição...");
        });

        const code = codeFromQuery;

        // Alguns fluxos chegam com tokens no hash
        const hp = parseHashParams();
        const access_token = hp.get("access_token");
        const refresh_token = hp.get("refresh_token");

        if (code) {
          const { error } = await supabaseBrowser.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (access_token && refresh_token) {
          const { error } = await supabaseBrowser.auth.setSession({ access_token, refresh_token });
          if (error) throw error;
        }

        // limpa URL para não reprocessar
        try {
          const cleanUrl = `${window.location.origin}/reset-password`;
          window.history.replaceState({}, "", cleanUrl);
        } catch {}

        safeSet(() => setStatus("Carregando sessão..."));
        const { data, error } = await supabaseBrowser.auth.getSession();
        if (error) throw error;

        const user = data.session?.user;
        if (!user) {
          safeSet(() => setStatus("Sessão não encontrada. Solicite um novo link em /login."));
          return;
        }

        safeSet(() => {
          setStatus("OK! Agora defina sua nova senha.");
          setReady(true);
        });
      } catch (e: any) {
        safeSet(() => {
          setStatus(null as any);
          setErr(e?.message ?? "Link inválido/expirado. Solicite novamente em /login.");
        });
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [codeFromQuery]);

  async function salvarNovaSenha(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);

    if (pass1.length < 6) {
      setErr("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (pass1 !== pass2) {
      setErr("As senhas não conferem.");
      return;
    }

    setLoading(true);
    try {
      const { data: sessData, error: sessErr } = await supabaseBrowser.auth.getSession();
      if (sessErr) throw sessErr;

      const user = sessData.session?.user;
      if (!user) {
        router.replace("/login");
        return;
      }

      // 1) Atualiza senha
      const { error: passErr } = await supabaseBrowser.auth.updateUser({ password: pass1 });
      if (passErr) throw passErr;

      // 2) Marca password_set = true
      const { error: upsertErr } = await supabaseBrowser
        .from("user_security")
        .upsert({ user_id: user.id, password_set: true }, { onConflict: "user_id" });
      if (upsertErr) throw upsertErr;

      // 3) Opcional: metadata
      await supabaseBrowser.auth.updateUser({ data: { passwordSet: true } });

      setMsg("Senha redefinida com sucesso! Indo para o app...");
      setTimeout(() => router.replace("/"), 400);
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao redefinir senha.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border bg-white p-5 shadow-sm">
        <h1 className="text-lg font-semibold">Redefinir senha</h1>

        {status && <p className="mt-2 text-sm text-gray-600">{status}</p>}

        {ready && (
          <form onSubmit={salvarNovaSenha} className="mt-4 grid gap-3">
            <label className="grid gap-1">
              <span className="text-sm font-medium">Nova senha</span>
              <input
                value={pass1}
                onChange={(e) => setPass1(e.target.value)}
                type="password"
                className="h-10 rounded-lg border px-3"
                autoComplete="new-password"
                disabled={loading}
              />
            </label>

            <label className="grid gap-1">
              <span className="text-sm font-medium">Confirmar nova senha</span>
              <input
                value={pass2}
                onChange={(e) => setPass2(e.target.value)}
                type="password"
                className="h-10 rounded-lg border px-3"
                autoComplete="new-password"
                disabled={loading}
              />
            </label>

            <button
              disabled={loading}
              className="h-11 rounded-lg border bg-black text-white font-semibold disabled:opacity-60"
            >
              {loading ? "Salvando..." : "Salvar nova senha"}
            </button>
          </form>
        )}

        {err && <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div>}
        {msg && <div className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">{msg}</div>}
      </div>
    </div>
  );
}
