// src/app/set-password/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function SetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const { data, error } = await supabaseBrowser.auth.getUser();
        if (error) throw error;
        if (!data?.user) {
          router.replace("/login");
          return;
        }
      } catch {
        router.replace("/login");
        return;
      } finally {
        setChecking(false);
      }
    };
    check();
  }, [router]);

  const minLenOk = useMemo(() => password.length >= 6, [password]);
  const matchOk = useMemo(() => confirm.length > 0 && password === confirm, [password, confirm]);

  async function setUserPassword() {
    if (loading) return;

    setLoading(true);
    setErr(null);
    setMsg(null);

    try {
      if (password.length < 6) throw new Error("A senha precisa ter no mínimo 6 caracteres.");
      if (password !== confirm) throw new Error("As senhas não conferem.");

      const { data: u, error: uErr } = await supabaseBrowser.auth.getUser();
      if (uErr) throw uErr;

      const user = u?.user;
      if (!user) throw new Error("Sessão inválida. Faça login novamente.");

      // 1) Define senha no Supabase Auth
      const { error: passErr } = await supabaseBrowser.auth.updateUser({ password });
      if (passErr) throw passErr;

      // 2) Marca password_set=true
      const { error: upErr } = await supabaseBrowser
        .from("user_security")
        .upsert({ user_id: user.id, password_set: true }, { onConflict: "user_id" });

      if (upErr) throw upErr;

      setMsg("Senha definida com sucesso! Entrando no app…");
      router.replace("/");
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao definir senha.");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    try {
      await supabaseBrowser.auth.signOut();
    } finally {
      router.replace("/login");
    }
  }

  // Loading “bonito” sem flicker
  if (checking) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border bg-white/90 p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-emerald-100 grid place-items-center">
              <span className="text-emerald-700 text-lg">🌿</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Definir senha</h1>
              <p className="text-sm text-gray-600">Verificando sessão…</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <div className="h-11 w-full rounded-xl bg-gray-100 animate-pulse" />
            <div className="h-11 w-full rounded-xl bg-gray-100 animate-pulse" />
            <div className="h-11 w-full rounded-xl bg-gray-100 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-8">
        {/* Cabeçalho */}
        <div className="mb-6">
          <div className="inline-flex items-center gap-3 rounded-2xl bg-white/70 px-4 py-3 shadow-sm border">
            <div className="h-11 w-11 rounded-2xl bg-emerald-100 grid place-items-center">
              <span className="text-emerald-800 text-xl">🌱</span>
            </div>
            <div className="leading-tight">
              <h1 className="text-xl font-semibold text-gray-900">Definir senha</h1>
              <p className="text-sm text-gray-600">
                Primeiro acesso: crie sua senha para entrar depois com e-mail + senha.
              </p>
            </div>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          {/* Nova senha */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-800">Nova senha</label>

            <div className="relative">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border px-4 py-3 pr-20 text-base outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300"
                type={showPass ? "text" : "password"}
                autoComplete="new-password"
                inputMode="text"
                placeholder="Mínimo 6 caracteres"
              />

              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 active:scale-[0.98] transition"
                aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPass ? "Ocultar" : "Mostrar"}
              </button>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <span
                className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${
                  minLenOk ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-gray-50 text-gray-400"
                }`}
              >
                {minLenOk ? "✓" : "•"}
              </span>
              <span className={minLenOk ? "text-emerald-700" : "text-gray-500"}>Mínimo 6 caracteres</span>
            </div>
          </div>

          {/* Confirmar */}
          <div className="mt-4 space-y-2">
            <label className="text-sm font-medium text-gray-800">Confirmar senha</label>

            <div className="relative">
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-xl border px-4 py-3 pr-20 text-base outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300"
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                inputMode="text"
                placeholder="Repita a senha"
              />

              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 active:scale-[0.98] transition"
                aria-label={showConfirm ? "Ocultar confirmação" : "Mostrar confirmação"}
              >
                {showConfirm ? "Ocultar" : "Mostrar"}
              </button>
            </div>

            {confirm.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <span
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${
                    matchOk ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"
                  }`}
                >
                  {matchOk ? "✓" : "!"}
                </span>
                <span className={matchOk ? "text-emerald-700" : "text-red-700"}>
                  {matchOk ? "As senhas conferem" : "As senhas não conferem"}
                </span>
              </div>
            )}
          </div>

          {/* Mensagens */}
          {err && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <b className="block">Ops!</b>
              {err}
            </div>
          )}

          {msg && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {msg}
            </div>
          )}

          {/* Ações */}
          <div className="mt-5 space-y-3">
            <button
              type="button"
              onClick={setUserPassword}
              disabled={loading || !minLenOk || !matchOk}
              className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white shadow-sm
                         hover:bg-emerald-700 active:scale-[0.99] transition
                         disabled:opacity-50 disabled:hover:bg-emerald-600 disabled:active:scale-100"
            >
              {loading ? "Salvando…" : "Salvar senha e continuar"}
            </button>

            <button
              type="button"
              onClick={logout}
              className="w-full rounded-xl border px-4 py-3 text-base font-medium text-gray-700 hover:bg-gray-50 active:scale-[0.99] transition"
            >
              Sair
            </button>
          </div>

          <p className="mt-4 text-xs text-gray-500">
            Dica: use uma senha que você consiga digitar fácil no celular, mas que não seja óbvia.
          </p>
        </div>

        {/* Rodapé discreto */}
        <div className="mt-6 text-center text-xs text-gray-400">
          PlantaCheck 🌿
        </div>
      </div>
    </div>
  );
}
