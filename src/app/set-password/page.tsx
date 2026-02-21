"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function SetPasswordPage() {
  const router = useRouter();

  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const safeSet = (fn: () => void) => {
      if (!cancelled) fn();
    };

    const run = async () => {
      setErr(null);
      setInfo("Verificando sessão...");

      const { data, error } = await supabaseBrowser.auth.getSession();
      if (error) {
        safeSet(() => setInfo(null));
        router.replace("/login");
        return;
      }

      const user = data.session?.user;
      if (!user) {
        safeSet(() => setInfo(null));
        router.replace("/login");
        return;
      }

      // Se já tem password_set = true, não precisa ficar nessa tela
      setInfo("Checando status de senha...");
      const { data: sec, error: secErr } = await supabaseBrowser
        .from("user_security")
        .select("password_set")
        .eq("user_id", user.id)
        .maybeSingle();

      if (secErr) {
        // Se der erro aqui, ainda deixa na tela para conseguir salvar a senha.
        safeSet(() => setInfo(null));
        return;
      }

      if (sec?.password_set) {
        safeSet(() => setInfo(null));
        router.replace("/");
        return;
      }

      safeSet(() => setInfo(null));
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setInfo(null);

    if (pass1.length < 6) {
      setErr("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (pass1 !== pass2) {
      setErr("As senhas não conferem.");
      return;
    }

    setLoading(true);
    setInfo("Salvando senha...");

    try {
      const { data: sessData, error: sessErr } = await supabaseBrowser.auth.getSession();
      if (sessErr) throw sessErr;

      const user = sessData.session?.user;
      if (!user) {
        router.replace("/login");
        return;
      }

      // 1) Define senha no Supabase Auth
      const { error: passErr } = await supabaseBrowser.auth.updateUser({ password: pass1 });
      if (passErr) throw passErr;

      // 2) Garante registro e marca password_set = true
      // (upsert pra evitar erro caso ainda não exista linha)
      const { error: upsertErr } = await supabaseBrowser
        .from("user_security")
        .upsert({ user_id: user.id, password_set: true }, { onConflict: "user_id" });

      if (upsertErr) throw upsertErr;

      // 3) Opcional: também marca metadata (ajuda seus guards antigos)
      const { error: metaErr } = await supabaseBrowser.auth.updateUser({
        data: { passwordSet: true },
      });
      if (metaErr) {
        // não bloqueia o fluxo por isso, porque o que manda é a tabela user_security
        // mas se quiser bloquear, é só trocar para: throw metaErr;
        console.warn("Falha ao atualizar metadata passwordSet:", metaErr.message);
      }

      setInfo("Tudo certo! Entrando no app...");
      router.replace("/");
    } catch (e: any) {
      setInfo(null);
      setErr(e?.message ?? "Erro ao definir senha.");
    } finally {
      setLoading(false);
    }
  }

  async function sair() {
    setLoading(true);
    setErr(null);
    setInfo(null);

    try {
      await supabaseBrowser.auth.signOut();
    } finally {
      router.replace("/login");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border bg-white p-5 shadow-sm">
        <h1 className="text-lg font-semibold">Defina sua senha</h1>
        <p className="mt-2 text-sm text-gray-600">
          Esse passo é obrigatório no primeiro acesso. Depois você entra só com e-mail e senha.
        </p>

        <form onSubmit={handleSetPassword} className="mt-4 grid gap-3">
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
            <span className="text-sm font-medium">Confirmar senha</span>
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
            {loading ? "Salvando..." : "Salvar senha e continuar"}
          </button>

          <button
            type="button"
            onClick={sair}
            disabled={loading}
            className="h-10 rounded-lg border bg-white font-semibold disabled:opacity-60"
          >
            Sair
          </button>
        </form>

        {info && <p className="mt-3 text-sm text-gray-600">{info}</p>}

        {err && (
          <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
        )}
      </div>
    </div>
  );
}
