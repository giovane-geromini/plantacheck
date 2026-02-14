"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const redirectTo = useMemo(() => {
    if (typeof window === "undefined") return undefined;
    // Volta para a HOME após clicar no link do email
    return `${window.location.origin}/`;
  }, []);

  useEffect(() => {
    // Se já estiver logado, manda direto pra home
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/");
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) router.replace("/");
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [router]);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);

    const clean = email.trim().toLowerCase();
    if (!clean || !clean.includes("@")) {
      setErr("Informe um e-mail válido.");
      return;
    }

    setSending(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: clean,
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (error) throw error;

      setMsg("Te enviei um link de acesso no e-mail. Abra e volte para o app.");
    } catch (e: any) {
      setErr(e?.message ?? "Não foi possível enviar o link. Tente novamente.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 16,
        fontFamily: "Arial, sans-serif",
        background: "#f6f7f8",
      }}
    >
      <div
        style={{
          width: "min(520px, 100%)",
          background: "white",
          border: "1px solid #e5e5e5",
          borderRadius: 14,
          padding: 18,
          boxShadow: "0 10px 24px rgba(0,0,0,0.08)",
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: 8 }}>🌱 PlantaCheck</h1>
        <p style={{ marginTop: 0, color: "#444" }}>
          Entre com seu e-mail para acessar seu lar e suas plantas.
        </p>

        <form onSubmit={sendMagicLink} style={{ display: "grid", gap: 10, marginTop: 14 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>E-mail</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seuemail@exemplo.com"
              inputMode="email"
              autoComplete="email"
              style={{
                padding: 12,
                borderRadius: 10,
                border: "1px solid #ccc",
                fontSize: 15,
              }}
            />
          </label>

          {err && <div style={{ color: "crimson", fontSize: 14 }}>{err}</div>}
          {msg && <div style={{ color: "#1b5e20", fontSize: 14 }}>{msg}</div>}

          <button
            type="submit"
            disabled={sending}
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.08)",
              background: "#2E7D32",
              color: "white",
              fontWeight: 700,
              cursor: sending ? "not-allowed" : "pointer",
            }}
          >
            {sending ? "Enviando..." : "Enviar link de acesso"}
          </button>

          <div style={{ color: "#666", fontSize: 13, lineHeight: 1.35 }}>
            Dica: abra o e-mail no seu celular e toque no link para entrar. Se abrir no PC, também funciona.
          </div>
        </form>
      </div>
    </main>
  );
}
