// src/app/login/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import InstallPwaButton from "@/components/InstallPwaButton";

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
      // ✅ Fluxo novo:
      // Supabase -> /auth/callback (route.ts server) -> next=/auth/finish (page)
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/callback?next=${encodeURIComponent("/auth/finish")}`
          : undefined;

      const { error } = await supabaseBrowser.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectTo },
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

      const { data: sec, error: secErr } = await supabaseBrowser
        .from("user_security")
        .select("password_set")
        .eq("user_id", user.id)
        .maybeSingle();

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
      // ✅ Fluxo novo (reset):
      // Supabase recovery -> /auth/callback (server) -> next=/auth/finish?next=/reset-password -> /reset-password
      const nextAfterCallback = `/auth/finish?next=${encodeURIComponent("/reset-password")}`;

      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextAfterCallback)}`
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

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    height: 42,
    borderRadius: 12,
    border: "1px solid #d7dbe0",
    background: active ? "#eef2f6" : "#fff",
    cursor: "pointer",
    fontWeight: 800,
    color: "#111",
  });

  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: 44,
    borderRadius: 12,
    border: "1px solid #d7dbe0",
    padding: "0 12px",
    background: "#fff",
    color: "#111",
    outline: "none",
  };

  const primaryBtn: React.CSSProperties = {
    width: "100%",
    height: 46,
    borderRadius: 12,
    border: "none",
    background: "#111",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
    opacity: loading ? 0.7 : 1,
  };

  const secondaryBtn: React.CSSProperties = {
    width: "100%",
    height: 44,
    borderRadius: 12,
    border: "1px solid #d7dbe0",
    background: "#fff",
    color: "#111",
    fontWeight: 800,
    cursor: "pointer",
    opacity: loading ? 0.7 : 1,
  };

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 18 }}>
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          background: "#fff",
          border: "1px solid #e6e8eb",
          borderRadius: 16,
          padding: 18,
          boxShadow: "0 10px 28px rgba(0,0,0,0.06)",
        }}
      >
        {/* Header / Marca */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: "#e9fff0",
              display: "grid",
              placeItems: "center",
              border: "1px solid #cfe9d7",
              fontSize: 22,
            }}
            aria-hidden
          >
            🌿
          </div>

          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontSize: 20, fontWeight: 950, color: "#111" }}>PlantaCheck</div>
            <div style={{ fontSize: 13, color: "#4b5563", marginTop: 4 }}>
              Controle inteligente para plantas saudáveis
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setMode("password")}
            style={tabStyle(mode === "password")}
          >
            Entrar (Senha)
          </button>
          <button type="button" onClick={() => setMode("first")} style={tabStyle(mode === "first")}>
            Primeiro acesso (Link)
          </button>
        </div>

        {/* Instalar (inline) */}
        <div style={{ marginBottom: 12 }}>
          <InstallPwaButton inline />
        </div>

        {mode === "first" ? (
          <form onSubmit={sendMagicLink} style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#111" }}>E-mail</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="seuemail@exemplo.com"
                style={inputStyle}
                autoComplete="email"
                disabled={loading}
              />
            </label>

            <button disabled={loading} style={primaryBtn}>
              {loading ? "Enviando..." : "Enviar Magic Link"}
            </button>

            <p style={{ opacity: 0.85, fontSize: 13, lineHeight: 1.45, color: "#374151" }}>
              Você vai receber um link para entrar. No primeiro acesso, vamos pedir para definir uma
              senha.
            </p>
          </form>
        ) : (
          <form onSubmit={signInWithPassword} style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#111" }}>E-mail</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="seuemail@exemplo.com"
                style={inputStyle}
                autoComplete="email"
                disabled={loading}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#111" }}>Senha</span>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="Sua senha"
                style={inputStyle}
                autoComplete="current-password"
                disabled={loading}
              />
            </label>

            <button disabled={loading} style={primaryBtn}>
              {loading ? "Entrando..." : "Entrar"}
            </button>

            <button type="button" onClick={forgotPassword} disabled={loading} style={secondaryBtn}>
              Esqueci minha senha
            </button>
          </form>
        )}

        {err && (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 12,
              background: "#ffe9e9",
              border: "1px solid #ffd0d0",
              color: "#7a1b1b",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            {err}
          </div>
        )}
        {msg && (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 12,
              background: "#e9fff0",
              border: "1px solid #cfe9d7",
              color: "#14532d",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            {msg}
          </div>
        )}
      </div>
    </main>
  );
}