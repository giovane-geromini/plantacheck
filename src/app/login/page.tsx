"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Mode = "first" | "password";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const safeSet = (fn: () => void) => {
      if (!cancelled) fn();
    };

    const check = async () => {
      // Se já estiver logado, checa tabela e manda pro lugar certo
      const { data, error } = await supabaseBrowser.auth.getSession();
      if (error) return;

      const user = data.session?.user;
      if (!user) return;

      safeSet(() => setMsg("Você já está logado. Checando acesso..."));

      const { data: sec, error: secErr } = await supabaseBrowser
        .from("user_security")
        .select("password_set")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!secErr && sec?.password_set) {
        router.replace("/");
        return;
      }

      // Se não existe ou password_set = false, manda definir senha
      router.replace("/set-password");
    };

    check();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);

    if (!email.trim()) {
      setErr("Digite seu e-mail.");
      return;
    }

    setLoading(true);
    try {
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/callback`
          : undefined;

      const { error } = await supabaseBrowser.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (error) throw error;

      setMsg("Link enviado! Verifique seu e-mail (caixa de entrada e spam).");
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao enviar link.");
    } finally {
      setLoading(false);
    }
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);

    if (!email.trim() || !password) {
      setErr("Informe e-mail e senha.");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabaseBrowser.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;

      const user = data.user;
      if (!user) {
        router.replace("/login");
        return;
      }

      // Quem manda é a tabela user_security
      const { data: sec, error: secErr } = await supabaseBrowser
        .from("user_security")
        .select("password_set")
        .eq("user_id", user.id)
        .maybeSingle();

      // Se der erro aqui por RLS, melhor não liberar.
      if (secErr) throw secErr;

      router.replace(sec?.password_set ? "/" : "/set-password");
    } catch (e: any) {
      setErr(e?.message ?? "Falha no login.");
    } finally {
      setLoading(false);
    }
  }

  async function forgotPassword() {
    setErr(null);
    setMsg(null);

    if (!email.trim()) {
      setErr("Digite seu e-mail para receber o link de redefinição.");
      return;
    }

    setLoading(true);
    try {
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/reset-password`
          : undefined;

      const { error } = await supabaseBrowser.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });

      if (error) throw error;

      setMsg("Link de redefinição enviado! Verifique seu e-mail.");
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao enviar redefinição.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>PlantaCheck</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setMode("password")}
          style={{
            flex: 1,
            padding: 10,
            borderRadius: 10,
            border: "1px solid #ddd",
            background: mode === "password" ? "#f5f5f5" : "white",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Entrar (Senha)
        </button>
        <button
          type="button"
          onClick={() => setMode("first")}
          style={{
            flex: 1,
            padding: 10,
            borderRadius: 10,
            border: "1px solid #ddd",
            background: mode === "first" ? "#f5f5f5" : "white",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Primeiro acesso (Link)
        </button>
      </div>

      {mode === "first" ? (
        <form onSubmit={sendMagicLink} style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>E-mail</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="seuemail@exemplo.com"
              style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
              autoComplete="email"
              disabled={loading}
            />
          </label>

          <button
            disabled={loading}
            style={{
              padding: 12,
              borderRadius: 10,
              border: "none",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            {loading ? "Enviando..." : "Enviar Magic Link"}
          </button>

          <p style={{ opacity: 0.8, fontSize: 13, lineHeight: 1.4 }}>
            Você vai receber um link para entrar. Ao entrar pela primeira vez, vamos pedir para você definir uma senha.
          </p>
        </form>
      ) : (
        <form onSubmit={signInWithPassword} style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>E-mail</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="seuemail@exemplo.com"
              style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
              autoComplete="email"
              disabled={loading}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>Senha</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="Sua senha"
              style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
              autoComplete="current-password"
              disabled={loading}
            />
          </label>

          <button
            disabled={loading}
            style={{
              padding: 12,
              borderRadius: 10,
              border: "none",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>

          <button
            type="button"
            onClick={forgotPassword}
            disabled={loading}
            style={{
              padding: 10,
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "white",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Esqueci minha senha
          </button>
        </form>
      )}

      {err && (
        <div style={{ marginTop: 14, padding: 10, borderRadius: 10, background: "#ffe9e9" }}>
          {err}
        </div>
      )}
      {msg && (
        <div style={{ marginTop: 14, padding: 10, borderRadius: 10, background: "#e9fff0" }}>
          {msg}
        </div>
      )}
    </main>
  );
}
