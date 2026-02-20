// src/app/house/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getOrCreateHousehold, updateHouseholdName, type Household } from "@/lib/household";

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

const secondaryBtn: React.CSSProperties = {
  width: "100%",
  height: 44,
  borderRadius: 12,
  border: "1px solid #d7dbe0",
  background: "#fff",
  color: "#111",
  fontWeight: 800,
  cursor: "pointer",
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

const alertOk: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 12,
  background: "#e9fff0",
  border: "1px solid #cfe9d7",
  color: "#14532d",
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

export default function HousePage() {
  const [loading, setLoading] = useState(true);
  const [house, setHouse] = useState<Household | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setErr(null);
    setMsg(null);
    setLoading(true);
    try {
      const h = await getOrCreateHousehold();
      setHouse(h);
      setName(h.name ?? "Casa PlantaCheck");
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao carregar/criar casa.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onSaveName(e?: React.FormEvent) {
    e?.preventDefault();
    if (!house) return;

    const trimmed = name.trim();
    if (!trimmed) {
      setErr("Informe um nome válido para a casa.");
      return;
    }

    setErr(null);
    setMsg(null);
    setSaving(true);
    try {
      await updateHouseholdName(house.id, trimmed);
      setHouse({ ...house, name: trimmed });
      setMsg("Nome da casa atualizado com sucesso.");
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao salvar nome da casa.");
    } finally {
      setSaving(false);
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
                🏠
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={titleStyle}>PlantaCheck</div>
                <div style={subtitleStyle}>
                  Casa • <b style={{ color: "#111" }}>{house?.name ?? "..."}</b>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button onClick={load} style={linkBtn} type="button">
                Recarregar
              </button>
              <Link href="/dashboard" style={{ ...linkBtn, display: "inline-block" }}>
                Dashboard
              </Link>
            </div>
          </div>

          <div style={{ marginTop: 12, ...muted }}>
            Neste modo, cada usuário tem <b>uma casa fixa</b>. Ela é criada automaticamente no primeiro acesso.
          </div>

          {loading && <div style={{ marginTop: 12, ...muted }}>Carregando...</div>}
          {!loading && err && <div style={alertError}>{err}</div>}
          {!loading && msg && <div style={alertOk}>{msg}</div>}

          {!loading && house && (
            <form onSubmit={onSaveName} style={{ marginTop: 14, display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <span style={labelStyle}>Nome da casa</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={inputStyle}
                  placeholder="Ex: Casa PlantaCheck"
                  disabled={saving}
                />
              </div>

              <button
                type="submit"
                disabled={saving || name.trim().length === 0}
                style={{
                  ...primaryBtn,
                  opacity: saving || name.trim().length === 0 ? 0.7 : 1,
                  cursor: saving || name.trim().length === 0 ? "not-allowed" : "pointer",
                }}
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>

              <div style={{ display: "grid", gap: 10 }}>
                <Link href="/plants" style={{ ...secondaryBtn, display: "grid", placeItems: "center", textDecoration: "none" }}>
                  Ir para Plantas →
                </Link>

                <div style={{ fontSize: 12, color: "#4b5563", lineHeight: 1.35 }}>
                  ID da casa: <span style={{ fontFamily: "monospace", color: "#111" }}>{house.id}</span>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Rodapé */}
        <div style={cardStyle}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/dashboard" style={{ ...linkBtn, display: "inline-block" }}>
              ← Dashboard
            </Link>
            <Link href="/plants" style={{ ...linkBtn, display: "inline-block" }}>
              🌿 Plantas
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}