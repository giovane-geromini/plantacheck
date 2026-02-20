// src/app/house/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getOrCreateHousehold, updateHouseholdName, type Household } from "@/lib/household";
import AppCard from "@/components/AppCard";

const linkSmall: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  textDecoration: "underline",
  color: "#111",
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
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#d7dbe0",
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
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#d7dbe0",
  background: "#fff",
  color: "#111",
  fontWeight: 900,
  cursor: "pointer",
};

function alertErrorBox(msg: string): React.CSSProperties {
  return {
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    background: "#ffe9e9",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#ffd0d0",
    color: "#7a1b1b",
    fontWeight: 800,
    fontSize: 13,
    lineHeight: 1.35,
  };
}

function alertOkBox(msg: string): React.CSSProperties {
  return {
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    background: "#e9fff0",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#cfe9d7",
    color: "#14532d",
    fontWeight: 800,
    fontSize: 13,
    lineHeight: 1.35,
  };
}

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
    <AppCard title="PlantaCheck" subtitle={`Casa • ${house?.name ?? "..."}`} icon="🏠" maxWidth={460}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <button type="button" onClick={load} style={linkSmall}>
          Recarregar
        </button>
        <Link href="/dashboard" style={linkSmall}>
          Dashboard
        </Link>
      </div>

      <div style={{ fontSize: 13, color: "#4b5563", fontWeight: 700, marginBottom: 12, lineHeight: 1.35 }}>
        Neste modo, cada usuário tem <b>uma casa fixa</b>. Ela é criada automaticamente no primeiro acesso.
      </div>

      {loading ? <div style={{ fontSize: 13, color: "#4b5563", fontWeight: 800 }}>Carregando...</div> : null}
      {!loading && err ? <div style={alertErrorBox(err)}>{err}</div> : null}
      {!loading && msg ? <div style={alertOkBox(msg)}>{msg}</div> : null}

      {!loading && house ? (
        <AppCard noCenter style={{ padding: 14 }}>
          <form onSubmit={onSaveName} style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={labelStyle}>Nome da casa</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={inputStyle}
                placeholder="Ex: Casa PlantaCheck"
                disabled={saving}
              />
            </label>

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

            <Link
              href="/plants"
              style={{
                ...secondaryBtn,
                display: "grid",
                placeItems: "center",
                textDecoration: "none",
              }}
            >
              Ir para Plantas →
            </Link>

            <div style={{ fontSize: 12, color: "#4b5563", lineHeight: 1.35 }}>
              ID da casa: <span style={{ fontFamily: "monospace", color: "#111" }}>{house.id}</span>
            </div>
          </form>
        </AppCard>
      ) : null}

      {/* respiro pro BottomNav */}
      <div style={{ height: 120 }} />
    </AppCard>
  );
}