"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        router.replace("/login");
        return;
      }

      setLoading(false);
    };

    checkAuth();
  }, [router]);

  if (loading) {
    return (
      <main style={{ padding: 24 }}>
        <h1>🌱 PlantaCheck</h1>
        <p>Carregando...</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>🌱 PlantaCheck</h1>
      <p>Usuário logado ✅</p>

      <p>
        Próximo passo: aqui entra o dashboard (plantas, households, sincronização).
      </p>

      <button
        onClick={async () => {
          await supabase.auth.signOut();
          router.replace("/login");
        }}
      >
        Sair
      </button>
    </main>
  );
}
