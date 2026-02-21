// src/app/plants/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { getOrCreateHousehold, type Household } from "@/lib/household";

type Plant = {
  id: string;
  household_id: string;
  name: string;
  place: string | null;

  frequency_days?: number | null;

  created_at?: string;
  updated_at?: string;
};

function getSupabaseClient(): any {
  return typeof supabaseBrowser === "function" ? (supabaseBrowser as any)() : (supabaseBrowser as any);
}

/** ======= UI (igual ao login) ======= */
const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  padding: 18,
  display: "grid",
  placeItems: "start center",
};

const containerStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 460,
  display: "grid",
  gap: 12,
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e6e8eb",
  borderRadius: 16,
  padding: 18,
  boxShadow: "0 10px 28px rgba(0,0,0,0.06)",
};

const headerRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const brandRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  minWidth: 0,
};

const logoStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 14,
  background: "#e9fff0",
  display: "grid",
  placeItems: "center",
  border: "1px solid #cfe9d7",
  fontSize: 22,
  flex: "0 0 auto",
};

const titleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 950,
  color: "#111",
  lineHeight: 1.1,
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#4b5563",
  marginTop: 6,
  lineHeight: 1.25,
};

const linkBtn: React.CSSProperties = {
  border: "none",
  background: "transparent",
  padding: 0,
  textDecoration: "underline",
  fontSize: 13,
  fontWeight: 800,
  color: "#111",
  cursor: "pointer",
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: "#111",
};

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
};

const dangerBtn: React.CSSProperties = {
  height: 34,
  padding: "0 12px",
  borderRadius: 12,
  border: "1px solid #ffd0d0",
  background: "#ffe9e9",
  color: "#7a1b1b",
  fontWeight: 950,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const detailsBtnSmall: React.CSSProperties = {
  height: 34,
  padding: "0 12px",
  borderRadius: 999,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#cfe9d7",
  background: "#e9fff0",
  color: "#14532d",
  fontWeight: 950,
  fontSize: 12,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  whiteSpace: "nowrap",
};

const alertError: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 12,
  background: "#ffe9e9",
  border: "1px solid #ffd0d0",
  color: "#7a1b1b",
  fontWeight: 800,
  fontSize: 13,
  lineHeight: 1.35,
};

const muted: React.CSSProperties = {
  fontSize: 13,
  color: "#374151",
  opacity: 0.9,
  lineHeight: 1.35,
};

export default function PlantsPage() {
  const [loading, setLoading] = useState(true);
  const [house, setHouse] = useState<Household | null>(null);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // form
  const [name, setName] = useState("");
  const [place, setPlace] = useState("");
  const [frequencyDays, setFrequencyDays] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    return [...plants].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [plants]);

  async function loadAll() {
    const supabase = getSupabaseClient();

    setErr(null);
    setLoading(true);

    try {
      const h = await getOrCreateHousehold();
      setHouse(h);

      const { data, error } = await supabase
        .from("plants")
        .select("*")
        .eq("household_id", h.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPlants((data ?? []) as Plant[]);
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao carregar plantas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addPlant(e?: React.FormEvent) {
    e?.preventDefault();

    const supabase = getSupabaseClient();
    if (!house) return;

    const trimmed = name.trim();
    if (!trimmed) {
      setErr("Informe o nome da planta.");
      return;
    }

    setErr(null);
    setSaving(true);

    try {
      const freq = frequencyDays.trim() === "" ? null : Math.max(0, parseInt(frequencyDays.trim(), 10));

      const payload: any = {
        household_id: house.id,
        name: trimmed,
        place: place.trim() || null,
      };

      if (Number.isFinite(freq as any)) {
        payload.frequency_days = freq;
      }

      const { data, error } = await supabase.from("plants").insert(payload).select("*").single();

      if (error) throw error;

      setPlants((prev) => [data as Plant, ...prev]);

      setName("");
      setPlace("");
      setFrequencyDays("");
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao adicionar planta.");
    } finally {
      setSaving(false);
    }
  }

  async function removePlant(id: string) {
    const supabase = getSupabaseClient();

    setErr(null);
    try {
      const ok = window.confirm("Excluir esta planta?");
      if (!ok) return;

      const { error } = await supabase.from("plants").delete().eq("id", id);
      if (error) throw error;

      setPlants((prev) => prev.filter((p) => p.id !== id));
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao excluir planta.");
    }
  }

  return (
    <main style={pageStyle}>
      <style>{`
        :root{
          --pc-border:#e6e8eb;
          --pc-input:#d7dbe0;
        }
        body{
          background:#f6f7f9;
          color:#111;
        }
      `}</style>

      <div style={containerStyle}>
        {/* Header */}
        <div style={cardStyle}>
          <div style={headerRow}>
            <div style={brandRow}>
              <div style={logoStyle} aria-hidden>
                🌿
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={titleStyle}>PlantaCheck</div>
                <div style={subtitleStyle}>
                  Plantas • Casa: <b style={{ color: "#111" }}>{house?.name ?? "..."}</b>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button onClick={loadAll} style={linkBtn} type="button">
                Recarregar
              </button>
              <Link href="/dashboard" style={{ ...linkBtn, display: "inline-block" }}>
                Dashboard
              </Link>
            </div>
          </div>

          {err && <div style={alertError}>{err}</div>}

          {/* Form */}
          <form onSubmit={addPlant} style={{ marginTop: 14, display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <span style={labelStyle}>Nome *</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={inputStyle}
                placeholder="Ex: Jiboia"
                disabled={saving}
              />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <span style={labelStyle}>Local (texto)</span>
              <input
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                style={inputStyle}
                placeholder="Ex: Sala / Varanda"
                disabled={saving}
              />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <span style={labelStyle}>Frequência (dias)</span>
              <input
                value={frequencyDays}
                onChange={(e) => setFrequencyDays(e.target.value)}
                style={inputStyle}
                inputMode="numeric"
                placeholder="Ex: 3"
                disabled={saving}
              />
            </div>

            <button
              type="submit"
              disabled={!house || saving || name.trim().length === 0}
              style={{
                ...primaryBtn,
                opacity: !house || saving || name.trim().length === 0 ? 0.7 : 1,
                cursor: !house || saving || name.trim().length === 0 ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Salvando..." : "Adicionar"}
            </button>

            <div style={muted}>
              Dica: mantenha o cadastro simples. A edição detalhada fica na tela “Ver detalhes” (por planta).
            </div>
          </form>
        </div>

        {/* Lista */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 950 }}>Minhas plantas</div>
            <div style={{ fontSize: 13, color: "#4b5563" }}>
              Total: <b style={{ color: "#111" }}>{plants.length}</b>
            </div>
          </div>

          {loading && <div style={{ marginTop: 12, ...muted }}>Carregando...</div>}

          {!loading && filtered.length === 0 && <div style={{ marginTop: 12, ...muted }}>Nenhuma planta cadastrada ainda.</div>}

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {filtered.map((p) => (
              <div
                key={p.id}
                style={{
                  border: "1px solid var(--pc-border)",
                  borderRadius: 14,
                  padding: 12,
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                  background: "#fff",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 950, fontSize: 15, color: "#111" }}>🌿 {p.name}</div>
                  <div style={{ marginTop: 6, fontSize: 13, color: "#374151", lineHeight: 1.35 }}>
                    {p.place ? `📍 ${p.place}` : "📍 (sem local)"}{" "}
                    {p.frequency_days != null ? (
                      <>
                        • <b style={{ color: "#111" }}>💧 {p.frequency_days}d</b>
                      </>
                    ) : null}
                  </div>
                </div>

                <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                  <Link href={`/planta/${p.id}`} style={detailsBtnSmall} aria-label={`Ver detalhes de ${p.name}`}>
                    Ver detalhes <span aria-hidden>→</span>
                  </Link>

                  <button type="button" onClick={() => removePlant(p.id)} style={dangerBtn} title="Excluir">
                    🗑️ Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* respiro p/ BottomNav */}
      <div style={{ height: 120 }} />
    </main>
  );
}