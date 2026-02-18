// src/app/plants/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { getOrCreateHousehold, type Household } from "@/lib/household";

type Plant = {
  id: string;
  household_id: string;
  name: string;
  place: string | null;
  sunlight: string | null;
  watering_interval_days: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function getSupabaseClient(): any {
  return typeof supabaseBrowser === "function" ? (supabaseBrowser as any)() : (supabaseBrowser as any);
}

export default function PlantsPage() {
  const [loading, setLoading] = useState(true);
  const [house, setHouse] = useState<Household | null>(null);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // form
  const [name, setName] = useState("");
  const [place, setPlace] = useState("");
  const [sunlight, setSunlight] = useState("");
  const [intervalDays, setIntervalDays] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

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

  async function addPlant() {
    const supabase = getSupabaseClient();

    if (!house) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    setErr(null);
    setSaving(true);
    try {
      const intervalParsed =
        intervalDays.trim() === "" ? null : Math.max(0, parseInt(intervalDays, 10));

      const { data, error } = await supabase
        .from("plants")
        .insert({
          household_id: house.id,
          name: trimmed,
          place: place.trim() || null,
          sunlight: sunlight.trim() || null,
          watering_interval_days: Number.isFinite(intervalParsed as any) ? intervalParsed : null,
          notes: notes.trim() || null,
        })
        .select("*")
        .single();

      if (error) throw error;

      setPlants((prev) => [data as Plant, ...prev]);

      setName("");
      setPlace("");
      setSunlight("");
      setIntervalDays("");
      setNotes("");
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
      const { error } = await supabase.from("plants").delete().eq("id", id);
      if (error) throw error;
      setPlants((prev) => prev.filter((p) => p.id !== id));
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao excluir planta.");
    }
  }

  return (
    <main className="mx-auto max-w-md p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Plantas</h1>
          <p className="text-sm opacity-80 mt-1">
            Casa: <b>{house?.name ?? "..."}</b>
          </p>
        </div>
        <Link className="text-sm underline" href="/house">
          Editar casa
        </Link>
      </div>

      {err && (
        <div className="mt-4 rounded-lg border p-3 text-sm">
          <b>Erro:</b> {err}
        </div>
      )}

      <section className="mt-4 rounded-xl border p-4">
        <h2 className="text-sm font-semibold">Adicionar planta</h2>

        <label className="mt-3 block text-xs font-medium">Nome *</label>
        <input
          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Samambaia"
        />

        <label className="mt-3 block text-xs font-medium">Local</label>
        <input
          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          placeholder="Ex: Sala / Varanda"
        />

        <label className="mt-3 block text-xs font-medium">Sol</label>
        <input
          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          value={sunlight}
          onChange={(e) => setSunlight(e.target.value)}
          placeholder="Ex: Indireto / Manhã"
        />

        <label className="mt-3 block text-xs font-medium">Rega (dias)</label>
        <input
          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          value={intervalDays}
          onChange={(e) => setIntervalDays(e.target.value)}
          inputMode="numeric"
          placeholder="Ex: 3"
        />

        <label className="mt-3 block text-xs font-medium">Notas</label>
        <textarea
          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex: gosta de borrifar água nas folhas"
          rows={3}
        />

        <button
          onClick={addPlant}
          disabled={!house || saving || name.trim().length === 0}
          className="mt-3 w-full rounded-lg border px-3 py-2 text-sm"
        >
          {saving ? "Salvando..." : "Adicionar"}
        </button>
      </section>

      <section className="mt-4">
        <h2 className="text-sm font-semibold">Minhas plantas</h2>

        {loading && <p className="mt-3 text-sm">Carregando...</p>}

        {!loading && plants.length === 0 && (
          <p className="mt-3 text-sm opacity-80">Nenhuma planta cadastrada ainda.</p>
        )}

        <div className="mt-3 space-y-2">
          {plants.map((p) => (
            <div key={p.id} className="rounded-xl border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs opacity-80">
                    {p.place ? `📍 ${p.place}` : "📍 (sem local)"}{" "}
                    {p.watering_interval_days != null ? `• 💧 ${p.watering_interval_days}d` : ""}
                  </p>
                  {p.sunlight && <p className="text-xs opacity-80 mt-1">☀️ {p.sunlight}</p>}
                </div>

                <button
                  onClick={() => removePlant(p.id)}
                  className="text-xs underline opacity-80"
                  title="Excluir"
                >
                  Excluir
                </button>
              </div>

              {p.notes && <p className="mt-2 text-xs opacity-90">{p.notes}</p>}
            </div>
          ))}
        </div>
      </section>

      <div className="mt-6 flex gap-3">
        <Link className="text-sm underline" href="/">
          ← Início
        </Link>
        <button className="text-sm underline" onClick={loadAll}>
          Recarregar
        </button>
      </div>
    </main>
  );
}
