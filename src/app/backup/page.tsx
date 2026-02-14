"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type PlantRow = {
  id: string;
  household_id: string;
  name: string;
  place: string | null;
  last_watered_date_iso: string | null;
  last_watered_time: string | null;
  frequency_days: number | null;
  waterings: any;
  created_at: string;
  updated_at: string;
};

export default function BackupPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [plants, setPlants] = useState<PlantRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setErr(null);
      setLoading(true);

      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        router.replace("/login");
        return;
      }

      const uid = sess.session.user.id;

      const { data: mems, error: memErr } = await supabase
        .from("household_members")
        .select("household_id")
        .eq("user_id", uid)
        .limit(1);

      if (memErr) {
        setErr(memErr.message ?? "Erro ao buscar lar.");
        setLoading(false);
        return;
      }

      const hid = mems?.[0]?.household_id ?? null;
      setHouseholdId(hid);

      if (!hid) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("plants")
        .select("*")
        .eq("household_id", hid)
        .order("created_at", { ascending: false });

      if (error) {
        setErr(error.message ?? "Erro ao carregar plantas.");
        setLoading(false);
        return;
      }

      setPlants((data ?? []) as PlantRow[]);
      setLoading(false);
    })();
  }, [router]);

  const jsonExport = useMemo(() => {
    return JSON.stringify({ householdId, exportedAt: new Date().toISOString(), plants }, null, 2);
  }, [householdId, plants]);

  function downloadJson() {
    const blob = new Blob([jsonExport], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantacheck-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main style={{ padding: 20, fontFamily: "Arial, sans-serif", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: 14 }}>
        <Link href="/" style={{ textDecoration: "underline" }}>
          ← Voltar
        </Link>
      </div>

      <h1 style={{ marginTop: 0 }}>Backup e exportações</h1>

      {loading ? (
        <p>Carregando...</p>
      ) : err ? (
        <div style={{ color: "crimson" }}>{err}</div>
      ) : !householdId ? (
        <p>Você ainda não está em um lar. Volte e crie/entre em um lar primeiro.</p>
      ) : (
        <>
          <p style={{ color: "#444" }}>
            Este backup exporta as plantas do seu <strong>lar</strong> (Supabase).
          </p>

          <button
            onClick={downloadJson}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ccc",
              cursor: "pointer",
              background: "#f7f7f7",
              marginBottom: 12,
            }}
          >
            ⬇️ Baixar backup (JSON)
          </button>

          <details>
            <summary style={{ cursor: "pointer" }}>Ver JSON</summary>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                border: "1px solid #ddd",
                borderRadius: 12,
                padding: 12,
                background: "white",
                marginTop: 10,
              }}
            >
              {jsonExport}
            </pre>
          </details>
        </>
      )}
    </main>
  );
}
