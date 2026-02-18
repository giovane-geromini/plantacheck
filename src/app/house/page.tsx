// src/app/house/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getOrCreateHousehold, updateHouseholdName, type Household } from "@/lib/household";

export default function HousePage() {
  const [loading, setLoading] = useState(true);
  const [house, setHouse] = useState<Household | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
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

  async function onSaveName() {
    if (!house) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    setErr(null);
    setSaving(true);
    try {
      await updateHouseholdName(house.id, trimmed);
      setHouse({ ...house, name: trimmed });
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao salvar nome da casa.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-semibold">Casa</h1>
      <p className="text-sm opacity-80 mt-1">
        Neste modo, cada usuário tem <b>uma casa fixa</b>. Ela é criada automaticamente no primeiro acesso.
      </p>

      {loading && <p className="mt-4 text-sm">Carregando...</p>}

      {!loading && err && (
        <div className="mt-4 rounded-lg border p-3 text-sm">
          <b>Erro:</b> {err}
        </div>
      )}

      {!loading && house && (
        <div className="mt-4 rounded-xl border p-4">
          <label className="text-sm font-medium">Nome da casa</label>
          <input
            className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Casa PlantaCheck"
          />

          <div className="mt-3 flex gap-2">
            <button
              onClick={onSaveName}
              disabled={saving || name.trim().length === 0}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>

            <Link className="rounded-lg border px-3 py-2 text-sm" href="/plants">
              Ir para Plantas →
            </Link>
          </div>

          <p className="mt-3 text-xs opacity-70">
            ID da casa: <span className="font-mono">{house.id}</span>
          </p>
        </div>
      )}

      <div className="mt-6">
        <Link className="text-sm underline" href="/">
          ← Voltar para o início
        </Link>
      </div>
    </main>
  );
}
