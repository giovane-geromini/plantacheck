// src/app/login/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Mode = "magic" | "password";

export default function LoginPage() {
  const router = useRouter();

  const [mounted, setMounted] = useState(false);

  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [redirectTo, setRedirectTo] = useState(""); // ✅ sempre definido após mount

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    // ✅ define o redirect só no client
    setRedirectTo(`${window.location.origin}/auth/callback`);
  }, []);

  async function sendMagicLink() {
    setLoading(true);
    setErr(null);
    setMsg(null);

    try {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail) throw new Error("Digite seu e-mail.");

      if (!redirectTo) {
        throw new Error("Redirect ainda não está pronto. Recarregue a página e tente novamente.");
      }

      // ✅ ajuda a debugar: confira no console qual redirect está indo pro Supabase
      console.log("[PlantaCheck] emailRedirectTo =", redirectTo);

      const { error } = await supabaseBrowser.auth.signInWithOtp({
        email: cleanEmail,
        options: { emailRedirectTo: redirectTo },
      });

      if (error) throw error;

      setMsg("Magic link enviado! Abra seu e-mail e clique no link para entrar.");
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao enviar magic link.");
    } finally {
      setLoading(false);
    }
  }

  async function signInWithPassword() {
    setLoading(true);
    setErr(null);
    setMsg(null);

    try {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail) throw new Error("Digite seu e-mail.");
      if (!password) throw new Error("Digite sua senha.");

      const { error } = await supabaseBrowser.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) throw error;

      router.replace("/");
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao entrar com senha.");
    } finally {
      setLoading(false);
    }
  }

  async function signUpWithPasswordDev() {
    setLoading(true);
    setErr(null);
    setMsg(null);

    try {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail) throw new Error("Digite seu e-mail.");
      if (!password || password.length < 6) {
        throw new Error("Defina uma senha com no mínimo 6 caracteres.");
      }

      if (!redirectTo) {
        throw new Error("Redirect ainda não está pronto. Recarregue a página e tente novamente.");
      }

      console.log("[PlantaCheck] emailRedirectTo (signUp) =", redirectTo);

      const { data, error } = await supabaseBrowser.auth.signUp({
        email: cleanEmail,
        password,
        options: { emailRedirectTo: redirectTo },
      });

      if (error) throw error;

      if (data.session) {
        setMsg("Conta criada e logado! Indo para o app...");
        router.replace("/");
      } else {
        setMsg("Conta criada! Se a confirmação de e-mail estiver ativa, confirme no e-mail para entrar.");
      }
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao criar conta.");
    } finally {
      setLoading(false);
    }
  }

  // ✅ Placeholder SSR-safe (sempre igual)
  const Shell = (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold">Entrar no PlantaCheck</h1>
        <p className="text-sm text-gray-600 mt-1">Carregando…</p>
      </div>
    </div>
  );

  return (
    // ✅ “aceita” diferenças caso algum layout/cache force HTML diferente
    <div suppressHydrationWarning>
      {!mounted ? (
        Shell
      ) : (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border bg-white p-5 shadow-sm">
            <h1 className="text-xl font-semibold">Entrar no PlantaCheck</h1>
            <p className="text-sm text-gray-600 mt-1">
              Primeiro acesso por magic link. Depois, login normal por e-mail + senha.
            </p>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setMode("password")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                  mode === "password" ? "bg-gray-100 font-medium" : "bg-white"
                }`}
              >
                Entrar com senha
              </button>

              <button
                type="button"
                onClick={() => setMode("magic")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                  mode === "magic" ? "bg-gray-100 font-medium" : "bg-white"
                }`}
              >
                Primeiro acesso (magic link)
              </button>
            </div>

            <div className="mt-4">
              <label className="text-sm font-medium">E-mail</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seuemail@exemplo.com"
                className="mt-1 w-full rounded-lg border px-3 py-2"
                autoComplete="email"
              />
            </div>

            {mode === "password" && (
              <div className="mt-3">
                <label className="text-sm font-medium">Senha</label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  type="password"
                  autoComplete="current-password"
                />
              </div>
            )}

            {err && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {err}
              </div>
            )}

            {msg && (
              <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                {msg}
              </div>
            )}

            <div className="mt-4">
              {mode === "magic" ? (
                <button
                  type="button"
                  onClick={sendMagicLink}
                  disabled={loading}
                  className="w-full rounded-lg bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {loading ? "Enviando..." : "Enviar magic link"}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={signInWithPassword}
                    disabled={loading}
                    className="w-full rounded-lg bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {loading ? "Entrando..." : "Entrar"}
                  </button>

                  <button
                    type="button"
                    onClick={signUpWithPasswordDev}
                    disabled={loading}
                    className="mt-2 w-full rounded-lg border px-3 py-2 text-sm disabled:opacity-60"
                    title="Apenas para testes em desenvolvimento"
                  >
                    {loading ? "Criando..." : "Criar conta (DEV) com senha"}
                  </button>
                </>
              )}
            </div>

            <div className="mt-4 text-xs text-gray-500">
              Se você nunca definiu senha, use <b>Primeiro acesso (magic link)</b>.
            </div>

            {/* Debug leve (opcional): você pode remover depois */}
            <div className="mt-3 text-[11px] text-gray-400 break-all">
              redirect: {redirectTo || "(carregando...)"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
