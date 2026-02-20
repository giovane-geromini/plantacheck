// src/app/auth/finish/page.tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export const dynamic = "force-dynamic";

function FinishInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [status, setStatus] = useState("Confirmando acesso...");

  useEffect(() => {
    let cancelled = false;
    const safe = (t: string) => !cancelled && setStatus(t);

    const run = async () => {
      try {
        const next = sp.get("next") ?? "/";

        safe("Carregando sessão...");
        const { data: sessData, error: sessErr } = await supabaseBrowser.auth.getSession();
        if (sessErr) throw sessErr;

        const user = sessData.session?.user;
        if (!user) {
          safe("Sessão não encontrada. Indo para /login...");
          router.replace("/login");
          return;
        }

        // Se o destino é reset-password, respeita o fluxo
        if (next === "/reset-password") {
          safe("Indo para redefinir senha...");
          router.replace("/reset-password");
          return;
        }

        safe("Preparando seu acesso...");
        const { error: upsertErr } = await supabaseBrowser
          .from("user_security")
          .upsert({ user_id: user.id }, { onConflict: "user_id" });

        if (upsertErr) throw upsertErr;

        safe("Verificando senha...");
        const { data: sec, error: secErr } = await supabaseBrowser
          .from("user_security")
          .select("password_set")
          .eq("user_id", user.id)
          .maybeSingle();

        if (secErr) throw secErr;

        if (!sec?.password_set) {
          safe("Primeiro acesso: definir senha...");
          router.replace("/set-password");
          return;
        }

        safe("Entrando no app...");
        router.replace("/");
      } catch (e: any) {
        safe(e?.message ?? "Erro ao confirmar acesso. Voltando para /login...");
        setTimeout(() => router.replace("/login"), 900);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [router, sp]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border bg-white p-5 shadow-sm">
        <h1 className="text-lg font-semibold">Confirmando login…</h1>
        <p className="mt-2 text-sm text-gray-600">{status}</p>
      </div>
    </div>
  );
}

export default function AuthFinishPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="w-full max-w-md rounded-xl border bg-white p-5 shadow-sm">
            <h1 className="text-lg font-semibold">Confirmando login…</h1>
            <p className="mt-2 text-sm text-gray-600">Carregando…</p>
          </div>
        </div>
      }
    >
      <FinishInner />
    </Suspense>
  );
}