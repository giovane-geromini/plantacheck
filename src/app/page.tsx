// src/app/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import InstallPwaButton from "@/components/InstallPwaButton";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function HomeGate() {
  const router = useRouter();

  const [status, setStatus] = useState("Verificando sessão...");

  useEffect(() => {
    let cancelled = false;

    const safeSet = (text: string) => {
      if (!cancelled) setStatus(text);
    };

    const run = async () => {
      safeSet("Verificando sessão...");

      const { data, error } = await supabaseBrowser.auth.getSession();
      if (error) {
        router.replace("/login");
        return;
      }

      const session = data.session;
      if (!session?.user) {
        router.replace("/login");
        return;
      }

      safeSet("Checando segurança...");

      const { data: sec, error: secErr } = await supabaseBrowser
        .from("user_security")
        .select("password_set")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (secErr) {
        console.error("Erro ao checar user_security:", secErr.message);
        router.replace("/login");
        return;
      }

      if (!sec?.password_set) {
        router.replace("/set-password");
        return;
      }

      // ✅ OK: manda para o dashboard real
      router.replace("/dashboard");
    };

    run();

    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        router.replace("/login");
        return;
      }
      run();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  return (
    <>
      <main style={{ padding: 24, fontFamily: "Arial, sans-serif" }}>
        <p>{status}</p>
      </main>

      {/* Mantém o PWA button disponível */}
      <InstallPwaButton />
    </>
  );
}