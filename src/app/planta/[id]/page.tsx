// src/app/planta/[id]/page.tsx
"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { getOrCreateHousehold, type Household } from "@/lib/household";

type DbPlant = {
  id: string;
  household_id: string;
  name: string;
  place: string | null; // legado texto (fallback)
  place_id: string | null; // relacional
  frequency_days?: number | null;

  created_at?: string;
  updated_at?: string;

  [key: string]: any;
};

type DbPlace = {
  id: string;
  household_id: string;
  name: string;
};

type DbEvent = {
  id: string;
  household_id: string;
  plant_id: string;
  event_type: "water" | "sun" | "config_change";
  event_date: string; // YYYY-MM-DD
  event_time: string | null; // HH:mm or HH:mm:ss
  created_at: string;
  created_by: string | null;
  meta: any;
};

const TZ_BRASILIA = "America/Sao_Paulo";

function nowInBrasiliaParts() {
  const now = new Date();

  const dateParts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ_BRASILIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});

  const timeParts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ_BRASILIA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});

  const day = dateParts.day;
  const month = dateParts.month;
  const year = dateParts.year;

  const hour = timeParts.hour;
  const minute = timeParts.minute;

  const timeBr = `${hour}:${minute}`;
  const dateIso = `${year}-${month}-${day}`;

  return { timeBr, dateIso };
}

function formatIsoToBrDate(dateIso: string) {
  const [y, m, d] = dateIso.split("-");
  return `${d}/${m}/${y}`;
}

function dateIsoToUtcMs(dateIso: string) {
  const [y, m, d] = dateIso.split("-").map((n) => Number(n));
  return Date.UTC(y, m - 1, d);
}

function addDaysToIso(dateIso: string, addDays: number) {
  const ms = dateIsoToUtcMs(dateIso);
  const out = new Date(ms + addDays * 24 * 60 * 60 * 1000);
  const y = out.getUTCFullYear();
  const m = String(out.getUTCMonth() + 1).padStart(2, "0");
  const d = String(out.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function diffDaysIso(aIso: string, bIso: string) {
  const a = dateIsoToUtcMs(aIso);
  const b = dateIsoToUtcMs(bIso);
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

function todayIsoBrasilia() {
  return nowInBrasiliaParts().dateIso;
}

type NextWaterInfo =
  | { kind: "noFrequency"; text: string }
  | { kind: "noLast"; text: string }
  | {
      kind: "ok";
      nextDateIso: string;
      text: string;
      deltaDays: number;
      isOverdue: boolean;
      isToday: boolean;
    };

function getNextWaterInfo(args: {
  frequencyDays: number | null;
  lastWaterDateIso: string | null;
}): NextWaterInfo {
  const { frequencyDays, lastWaterDateIso } = args;

  if (!frequencyDays || frequencyDays <= 0) {
    return { kind: "noFrequency", text: "Frequência: —" };
  }
  if (!lastWaterDateIso) {
    return { kind: "noLast", text: `Frequência: a cada ${frequencyDays} dia(s) • Próxima: —` };
  }

  const nextIso = addDaysToIso(lastWaterDateIso, frequencyDays);
  const todayIso = todayIsoBrasilia();
  const delta = diffDaysIso(todayIso, nextIso);

  const isToday = delta === 0;
  const isOverdue = delta < 0;

  let statusTxt = "";
  if (isToday) statusTxt = "Hoje";
  else if (isOverdue) statusTxt = `Atrasada há ${Math.abs(delta)} dia(s)`;
  else statusTxt = `Faltam ${delta} dia(s)`;

  return {
    kind: "ok",
    nextDateIso: nextIso,
    deltaDays: delta,
    isOverdue,
    isToday,
    text: `Próxima: ${formatIsoToBrDate(nextIso)} • ${statusTxt}`,
  };
}

// ===== Entrada manual BR =====
function parseBrDateToIso(br: string): string | null {
  const m = br.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;

  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);

  if (!Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yyyy)) return null;
  if (yyyy < 1900 || yyyy > 3000) return null;
  if (mm < 1 || mm > 12) return null;

  const daysInMonth = new Date(Date.UTC(yyyy, mm, 0)).getUTCDate();
  if (dd < 1 || dd > daysInMonth) return null;

  return `${String(yyyy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function isValidTimeHHmm(t: string): boolean {
  const m = t.trim().match(/^(\d{2}):(\d{2})$/);
  if (!m) return false;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23) return false;
  if (mm < 0 || mm > 59) return false;
  return true;
}

function hhmmFromEventTime(t: string | null): string | null {
  if (!t) return null;
  return String(t).slice(0, 5);
}

export default function PlantDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const plantId = params?.id;

  const [house, setHouse] = useState<Household | null>(null);
  const [plant, setPlant] = useState<DbPlant | null>(null);
  const [places, setPlaces] = useState<DbPlace[]>([]);
  const [events, setEvents] = useState<DbEvent[]>([]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // edição
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPlaceId, setEditPlaceId] = useState<string>("");
  const [editFrequency, setEditFrequency] = useState<string>("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editMsg, setEditMsg] = useState<string | null>(null);

  // criação rápida de ambiente
  const [newPlaceName, setNewPlaceName] = useState("");
  const [creatingPlace, setCreatingPlace] = useState(false);

  // rega manual
  const [showManual, setShowManual] = useState(false);
  const [manualDateBr, setManualDateBr] = useState("");
  const [manualTime, setManualTime] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  async function loadAll() {
    if (!plantId) return;

    setErr(null);
    setLoading(true);

    try {
      const h = await getOrCreateHousehold();
      setHouse(h);

      const placesRes = await supabaseBrowser
        .from("places")
        .select("id, household_id, name")
        .eq("household_id", h.id)
        .order("created_at", { ascending: true });

      if (placesRes.error) throw placesRes.error;
      setPlaces((placesRes.data ?? []) as DbPlace[]);

      const plantRes = await supabaseBrowser
        .from("plants")
        .select("*")
        .eq("id", plantId)
        .eq("household_id", h.id)
        .maybeSingle();

      if (plantRes.error) throw plantRes.error;
      if (!plantRes.data) {
        setPlant(null);
        setEvents([]);
        return;
      }
      setPlant(plantRes.data as DbPlant);

      const evRes = await supabaseBrowser
        .from("events")
        .select("*")
        .eq("household_id", h.id)
        .eq("plant_id", plantId)
        .order("event_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);

      if (evRes.error) throw evRes.error;
      setEvents((evRes.data ?? []) as DbEvent[]);
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao carregar detalhes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantId]);

  const placeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of places) map.set(p.id, p.name);
    return map;
  }, [places]);

  const lastWaterEvent = useMemo(() => {
    return events.find((e) => e.event_type === "water") ?? null;
  }, [events]);

  const lastWaterDateIso = lastWaterEvent?.event_date ?? null;
  const lastWaterTime = hhmmFromEventTime(lastWaterEvent?.event_time ?? null);

  const frequencyDays = useMemo(() => {
    const v = typeof plant?.frequency_days === "number" ? plant.frequency_days : null;
    if (!v || v <= 0) return null;
    return v;
  }, [plant?.frequency_days]);

  const placeLabel = useMemo(() => {
    if (!plant) return "—";
    const byId = plant.place_id ? placeNameById.get(plant.place_id) : null;
    return byId ?? plant.place ?? "—";
  }, [plant, placeNameById]);

  const nextInfo = useMemo(() => {
    return getNextWaterInfo({ frequencyDays, lastWaterDateIso });
  }, [frequencyDays, lastWaterDateIso]);

  useEffect(() => {
    if (!plant) return;

    setEditName(plant.name);
    setEditPlaceId(plant.place_id ?? "");
    setEditFrequency(frequencyDays ? String(frequencyDays) : "");

    const now = nowInBrasiliaParts();
    setManualDateBr(formatIsoToBrDate(now.dateIso));
    setManualTime(now.timeBr);
  }, [plant?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function waterNow() {
    if (!house || !plant) return;

    setErr(null);
    setEditMsg(null);
    setManualError(null);

    try {
      const { data: userData } = await supabaseBrowser.auth.getUser();
      const userId = userData?.user?.id ?? null;

      const { dateIso, timeBr } = nowInBrasiliaParts();

      const ins = await supabaseBrowser.from("events").insert({
        household_id: house.id,
        plant_id: plant.id,
        event_type: "water",
        event_date: dateIso,
        event_time: timeBr,
        created_by: userId,
        meta: {},
      });

      if (ins.error) throw ins.error;

      await loadAll();
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao registrar rega.");
    }
  }

  async function addManualWatering() {
    if (!house || !plant) return;

    const iso = parseBrDateToIso(manualDateBr);
    if (!iso) {
      setManualError("Data inválida. Use dd/mm/aaaa (ex.: 13/02/2026).");
      return;
    }
    if (!isValidTimeHHmm(manualTime)) {
      setManualError("Hora inválida. Use HH:mm no formato 24h (ex.: 13:05).");
      return;
    }

    setManualError(null);
    setErr(null);

    try {
      const { data: userData } = await supabaseBrowser.auth.getUser();
      const userId = userData?.user?.id ?? null;

      const ins = await supabaseBrowser.from("events").insert({
        household_id: house.id,
        plant_id: plant.id,
        event_type: "water",
        event_date: iso,
        event_time: manualTime.trim(),
        created_by: userId,
        meta: { manual: true },
      });

      if (ins.error) throw ins.error;

      setEditMsg("Rega manual registrada.");
      setShowManual(false);

      await loadAll();
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao registrar rega manual.");
    }
  }

  async function removePlant() {
    if (!house || !plant) return;

    const ok = window.confirm(`Remover "${plant.name}"?`);
    if (!ok) return;

    setErr(null);

    try {
      const delEv = await supabaseBrowser
        .from("events")
        .delete()
        .eq("household_id", house.id)
        .eq("plant_id", plant.id);

      if (delEv.error) throw delEv.error;

      const del = await supabaseBrowser
        .from("plants")
        .delete()
        .eq("household_id", house.id)
        .eq("id", plant.id);

      if (del.error) throw del.error;

      router.replace("/dashboard");
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao remover planta.");
    }
  }

  function startEdit() {
    if (!plant) return;
    setIsEditing(true);
    setEditError(null);
    setEditMsg(null);
  }

  function cancelEdit() {
    if (!plant) return;
    setIsEditing(false);
    setEditError(null);
    setEditMsg(null);
    setEditName(plant.name);
    setEditPlaceId(plant.place_id ?? "");
    setEditFrequency(frequencyDays ? String(frequencyDays) : "");
  }

  async function createPlaceQuick() {
    if (!house) return;

    const name = newPlaceName.trim();
    if (!name) return;

    setCreatingPlace(true);
    setErr(null);

    try {
      const { data: userData } = await supabaseBrowser.auth.getUser();
      const userId = userData?.user?.id ?? null;

      const ins = await supabaseBrowser
        .from("places")
        .insert({
          household_id: house.id,
          name,
          created_by: userId,
        })
        .select("id, household_id, name")
        .single();

      if (ins.error) throw ins.error;

      const created = ins.data as DbPlace;
      setPlaces((prev) => [...prev, created]);

      setNewPlaceName("");
      setEditPlaceId(created.id);
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao criar ambiente.");
    } finally {
      setCreatingPlace(false);
    }
  }

  async function saveEdit() {
    if (!house || !plant) return;

    const nameTrim = editName.trim();
    if (!nameTrim) {
      setEditError("O nome da planta não pode ficar vazio.");
      return;
    }

    let freq: number | null = null;
    const freqTrim = editFrequency.trim();
    if (freqTrim) {
      const n = Number(freqTrim);
      if (!Number.isFinite(n) || n <= 0) {
        setEditError("Frequência inválida. Use um número de dias maior que 0 (ex.: 3, 7, 14).");
        return;
      }
      freq = Math.floor(n);
    }

    setEditError(null);
    setErr(null);

    const nextPlaceId = editPlaceId.trim() ? editPlaceId.trim() : null;
    const nextPlaceText = nextPlaceId ? placeNameById.get(nextPlaceId) ?? null : null;

    try {
      const upd = await supabaseBrowser
        .from("plants")
        .update({
          name: nameTrim,
          frequency_days: freq,
          place_id: nextPlaceId,
          place: nextPlaceText,
        })
        .eq("household_id", house.id)
        .eq("id", plant.id)
        .select("*")
        .single();

      if (upd.error) throw upd.error;

      const { data: userData } = await supabaseBrowser.auth.getUser();
      const userId = userData?.user?.id ?? null;

      const now = nowInBrasiliaParts();

      const meta = {
        from: {
          name: plant.name,
          frequency_days: plant.frequency_days ?? null,
          place_id: plant.place_id ?? null,
        },
        to: {
          name: nameTrim,
          frequency_days: freq,
          place_id: nextPlaceId,
        },
      };

      const insEv = await supabaseBrowser.from("events").insert({
        household_id: house.id,
        plant_id: plant.id,
        event_type: "config_change",
        event_date: now.dateIso,
        event_time: now.timeBr,
        created_by: userId,
        meta,
      });

      if (insEv.error) throw insEv.error;

      setIsEditing(false);
      setEditMsg("Alterações salvas.");
      await loadAll();
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao salvar alterações.");
    }
  }

  async function removeEvent(eventId: string) {
    if (!house || !plant) return;

    const ok = window.confirm("Remover este evento? (rega/sol/config)");
    if (!ok) return;

    setErr(null);

    try {
      const del = await supabaseBrowser
        .from("events")
        .delete()
        .eq("household_id", house.id)
        .eq("plant_id", plant.id)
        .eq("id", eventId);

      if (del.error) throw del.error;

      await loadAll();
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao remover evento.");
    }
  }

  if (loading) {
    return (
      <main style={{ padding: "clamp(16px, 3vw, 32px)", fontFamily: "Arial, sans-serif" }}>
        <p>Carregando...</p>
      </main>
    );
  }

  if (!plant) {
    return (
      <main
        style={{
          padding: "clamp(16px, 3vw, 32px)",
          fontFamily: "Arial, sans-serif",
          maxWidth: 900,
          margin: "0 auto",
        }}
      >
        <h1 style={{ marginTop: 0 }}>Planta não encontrada</h1>
        <p>Essa planta pode ter sido removida.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/dashboard" style={{ textDecoration: "none" }}>
            Dashboard
          </Link>
        </div>
      </main>
    );
  }

  const lastLine = lastWaterDateIso
    ? `${formatIsoToBrDate(lastWaterDateIso)}${lastWaterTime ? ` às ${lastWaterTime}` : ""}`
    : "—";

  return (
    <main
      style={{
        padding: "clamp(16px, 3vw, 32px)",
        fontFamily: "Arial, sans-serif",
        maxWidth: 900,
        margin: "0 auto",
      }}
    >
      <div style={{ marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          onClick={() => router.back()}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #ccc",
            cursor: "pointer",
            background: "#fff",
          }}
        >
          ← Voltar
        </button>

        <Link
          href="/dashboard"
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #ccc",
            background: "#f7f7f7",
            textDecoration: "none",
            color: "inherit",
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          🏠 Dashboard
        </Link>
      </div>

      {err && (
        <div style={{ marginBottom: 12, border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <b>Erro:</b> {err}
        </div>
      )}

      <header style={{ marginBottom: 16 }}>
        {!isEditing ? (
          <>
            <h1 style={{ margin: 0 }}>{plant.name}</h1>

            <p style={{ marginTop: 8, color: "#444" }}>
              📍 Ambiente: <strong>{placeLabel}</strong>
            </p>

            <p style={{ marginTop: 6, color: "#444" }}>
              💧 Última rega: <strong>{lastLine}</strong>
            </p>

            <p style={{ marginTop: 6, color: "#444" }}>
              🗓️ <strong>{nextInfo.text}</strong>
            </p>
          </>
        ) : (
          <>
            <h1 style={{ margin: 0 }}>Editar planta</h1>

            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span>Nome *</span>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
                />
              </label>

              <div style={{ display: "grid", gap: 6 }}>
                <span>Ambiente</span>
                <select
                  value={editPlaceId}
                  onChange={(e) => setEditPlaceId(e.target.value)}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
                >
                  <option value="">(sem ambiente)</option>
                  {places.map((pl) => (
                    <option key={pl.id} value={pl.id}>
                      {pl.name}
                    </option>
                  ))}
                </select>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    value={newPlaceName}
                    onChange={(e) => setNewPlaceName(e.target.value)}
                    placeholder="Criar novo ambiente..."
                    style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc", minWidth: 240 }}
                  />
                  <button
                    onClick={createPlaceQuick}
                    disabled={creatingPlace || newPlaceName.trim().length === 0}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #ccc",
                      cursor: "pointer",
                      background: "#fff",
                    }}
                  >
                    {creatingPlace ? "Criando..." : "+ Ambiente"}
                  </button>
                </div>
              </div>

              <label style={{ display: "grid", gap: 6 }}>
                <span>Frequência de rega (dias)</span>
                <input
                  value={editFrequency}
                  onChange={(e) => setEditFrequency(e.target.value)}
                  inputMode="numeric"
                  placeholder="Ex.: 3, 7, 14..."
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
                />
                <span style={{ fontSize: 13, color: "#666" }}>
                  Dica: deixe em branco se não quiser controlar por frequência.
                </span>
              </label>

              {editError && <div style={{ color: "crimson", fontSize: 14 }}>{editError}</div>}
              {editMsg && <div style={{ color: "#2e7d32", fontSize: 14 }}>{editMsg}</div>}
            </div>
          </>
        )}
      </header>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 16,
          background: "white",
          marginBottom: 16,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <button
          onClick={waterNow}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #ccc",
            cursor: "pointer",
            background: "#f7f7f7",
          }}
        >
          Reguei agora
        </button>

        <button
          onClick={() => {
            setShowManual((v) => !v);
            setManualError(null);
            setEditMsg(null);
          }}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #ccc",
            cursor: "pointer",
            background: "#fff",
          }}
        >
          + Registrar rega manual
        </button>

        {!isEditing ? (
          <button
            onClick={startEdit}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ccc",
              cursor: "pointer",
              background: "#fff",
            }}
          >
            ✏️ Editar
          </button>
        ) : (
          <>
            <button
              onClick={saveEdit}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #ccc",
                cursor: "pointer",
                background: "#f7f7f7",
              }}
            >
              ✅ Salvar
            </button>
            <button
              onClick={cancelEdit}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #ccc",
                cursor: "pointer",
                background: "#fff",
              }}
            >
              ❌ Cancelar
            </button>
          </>
        )}

        <button
          onClick={removePlant}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #ccc",
            cursor: "pointer",
            background: "#fff",
            marginLeft: "auto",
          }}
        >
          🗑️ Remover planta
        </button>
      </section>

      {showManual && (
        <section
          style={{
            border: "1px solid #ddd",
            borderRadius: 12,
            padding: 16,
            background: "white",
            marginBottom: 16,
          }}
        >
          <h2 style={{ marginTop: 0 }}>Registrar rega manual</h2>

          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Data (dd/mm/aaaa)</span>
              <input
                value={manualDateBr}
                onChange={(e) => setManualDateBr(e.target.value)}
                placeholder="Ex.: 13/02/2026"
                style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Hora (HH:mm)</span>
              <input
                value={manualTime}
                onChange={(e) => setManualTime(e.target.value)}
                placeholder="Ex.: 13:05"
                style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
              />
            </label>

            {manualError && <div style={{ color: "crimson", fontSize: 14 }}>{manualError}</div>}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                onClick={addManualWatering}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  cursor: "pointer",
                  background: "#f7f7f7",
                }}
              >
                ✅ Salvar rega manual
              </button>

              <button
                onClick={() => {
                  setShowManual(false);
                  setManualError(null);
                }}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  cursor: "pointer",
                  background: "#fff",
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </section>
      )}

      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, background: "white" }}>
        <h2 style={{ marginTop: 0 }}>Eventos</h2>

        {events.length === 0 ? (
          <p>Nenhum evento ainda. Use “Reguei agora” ou ações em lote no Dashboard.</p>
        ) : (
          <ul style={{ paddingLeft: 18, margin: 0, display: "grid", gap: 8 }}>
            {events.map((e) => (
              <li key={e.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span>
                  {e.event_type === "water" ? "💧 Rega" : e.event_type === "sun" ? "☀️ Sol" : "⚙️ Config"} •{" "}
                  {formatIsoToBrDate(e.event_date)}
                  {hhmmFromEventTime(e.event_time) ? ` às ${hhmmFromEventTime(e.event_time)}` : ""}
                </span>

                <button
                  onClick={() => removeEvent(e.id)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 10,
                    border: "1px solid #ccc",
                    cursor: "pointer",
                    background: "#fff",
                  }}
                  title="Remover evento"
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
        )}

        {editMsg && !isEditing && <div style={{ marginTop: 10, color: "#2e7d32", fontSize: 14 }}>{editMsg}</div>}
      </section>

      <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href="/dashboard" style={{ textDecoration: "underline" }}>
          ← Dashboard
        </Link>
        <Link href="/plants" style={{ textDecoration: "underline" }}>
          Cadastro (lista simples)
        </Link>
      </div>
    </main>
  );
}