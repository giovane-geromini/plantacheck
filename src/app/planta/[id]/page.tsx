"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Watering = {
  dateIso: string; // YYYY-MM-DD
  time: string; // HH:mm
};

type Plant = {
  id: string;
  name: string;
  place?: string;

  lastWateredDateIso?: string;
  lastWateredTime?: string;

  waterings: Watering[];

  frequencyDays?: number;
};

const TZ_BRASILIA = "America/Sao_Paulo";
const STORAGE_KEY = "plantacheck:v4:plants";

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

function getNextWaterInfo(p: Plant): NextWaterInfo {
  if (!p.frequencyDays || p.frequencyDays <= 0) {
    return { kind: "noFrequency", text: "Frequência: —" };
  }
  if (!p.lastWateredDateIso) {
    return { kind: "noLast", text: `Frequência: a cada ${p.frequencyDays} dia(s) • Próxima: —` };
  }

  const nextIso = addDaysToIso(p.lastWateredDateIso, p.frequencyDays);
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

function loadPlants(): Plant[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Plant[];
  } catch {
    return [];
  }
}

function savePlants(plants: Plant[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plants));
  } catch {}
}

function wateringKey(w: Watering) {
  return `${w.dateIso}T${w.time}`;
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

function compareWateringsDesc(a: Watering, b: Watering) {
  const aKey = `${a.dateIso}T${a.time}`;
  const bKey = `${b.dateIso}T${b.time}`;
  return bKey.localeCompare(aKey);
}

export default function PlantDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [plants, setPlants] = useState<Plant[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // edição
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPlace, setEditPlace] = useState("");
  const [editFrequency, setEditFrequency] = useState<string>("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editMsg, setEditMsg] = useState<string | null>(null);

  // rega manual
  const [showManual, setShowManual] = useState(false);
  const [manualDateBr, setManualDateBr] = useState("");
  const [manualTime, setManualTime] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  useEffect(() => {
    setPlants(loadPlants());
    setHydrated(true);
  }, []);

  const plant = useMemo(() => plants.find((p) => p.id === id), [plants, id]);

  useEffect(() => {
    if (!plant) return;

    setEditName(plant.name);
    setEditPlace(plant.place ?? "");
    setEditFrequency(plant.frequencyDays ? String(plant.frequencyDays) : "");

    const now = nowInBrasiliaParts();
    setManualDateBr(formatIsoToBrDate(now.dateIso));
    setManualTime(now.timeBr);
  }, [plant?.id]);

  function persist(next: Plant[]) {
    setPlants(next);
    savePlants(next);
  }

  function waterNow() {
    if (!plant) return;

    const { dateIso, timeBr } = nowInBrasiliaParts();
    const newW: Watering = { dateIso, time: timeBr };

    const next = plants.map((p) => {
      if (p.id !== plant.id) return p;
      const merged = [newW, ...p.waterings].sort(compareWateringsDesc);
      const newest = merged[0];
      return {
        ...p,
        lastWateredDateIso: newest.dateIso,
        lastWateredTime: newest.time,
        waterings: merged,
      };
    });

    persist(next);
    setEditMsg(null);
    setShowManual(false);
    setManualError(null);
  }

  function addManualWatering() {
    if (!plant) return;

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

    const newW: Watering = { dateIso: iso, time: manualTime.trim() };

    const next = plants.map((p) => {
      if (p.id !== plant.id) return p;

      const merged = [newW, ...p.waterings].sort(compareWateringsDesc);
      const newest = merged[0];

      return {
        ...p,
        lastWateredDateIso: newest.dateIso,
        lastWateredTime: newest.time,
        waterings: merged,
      };
    });

    persist(next);
    setEditMsg("Rega manual registrada.");
    setShowManual(false);
  }

  function removePlant() {
    if (!plant) return;
    const ok = window.confirm(`Remover "${plant.name}"?`);
    if (!ok) return;

    const next = plants.filter((p) => p.id !== plant.id);
    persist(next);
    router.push("/");
  }

  function startEdit() {
    if (!plant) return;
    setIsEditing(true);
    setEditError(null);
    setEditMsg(null);
    setEditName(plant.name);
    setEditPlace(plant.place ?? "");
    setEditFrequency(plant.frequencyDays ? String(plant.frequencyDays) : "");
  }

  function cancelEdit() {
    if (!plant) return;
    setIsEditing(false);
    setEditError(null);
    setEditMsg(null);
    setEditName(plant.name);
    setEditPlace(plant.place ?? "");
    setEditFrequency(plant.frequencyDays ? String(plant.frequencyDays) : "");
  }

  function saveEdit() {
    if (!plant) return;

    const nameTrim = editName.trim();
    const placeTrim = editPlace.trim();

    if (!nameTrim) {
      setEditError("O nome da planta não pode ficar vazio.");
      return;
    }

    let freq: number | undefined = undefined;
    const freqTrim = editFrequency.trim();
    if (freqTrim) {
      const n = Number(freqTrim);
      if (!Number.isFinite(n) || n <= 0) {
        setEditError("Frequência inválida. Use um número de dias maior que 0 (ex.: 3, 7, 14).");
        return;
      }
      freq = Math.floor(n);
    }

    const next = plants.map((p) => {
      if (p.id !== plant.id) return p;
      return {
        ...p,
        name: nameTrim,
        place: placeTrim ? placeTrim : undefined,
        frequencyDays: freq,
      };
    });

    persist(next);
    setIsEditing(false);
    setEditError(null);
    setEditMsg("Alterações salvas.");
  }

  function removeWatering(targetKey: string) {
    if (!plant) return;

    const ok = window.confirm("Remover este registro do histórico?");
    if (!ok) return;

    const next = plants.map((p) => {
      if (p.id !== plant.id) return p;

      const filtered = p.waterings.filter((w) => wateringKey(w) !== targetKey).sort(compareWateringsDesc);

      if (filtered.length === 0) {
        return { ...p, waterings: filtered, lastWateredDateIso: undefined, lastWateredTime: undefined };
      }

      const newest = filtered[0];
      return {
        ...p,
        waterings: filtered,
        lastWateredDateIso: newest.dateIso,
        lastWateredTime: newest.time,
      };
    });

    persist(next);
    setEditMsg(null);
  }

  if (!hydrated) {
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
          <Link href="/" style={{ textDecoration: "none" }}>
            Página Inicial
          </Link>
        </div>
      </main>
    );
  }

  const lastLine = plant.lastWateredDateIso
    ? `${formatIsoToBrDate(plant.lastWateredDateIso)} às ${plant.lastWateredTime ?? "—"}`
    : "—";

  const nextInfo = getNextWaterInfo(plant);

  return (
    <main
      style={{
        padding: "clamp(16px, 3vw, 32px)",
        fontFamily: "Arial, sans-serif",
        maxWidth: 900,
        margin: "0 auto",
      }}
    >
      {/* ✅ topo: Voltar + Página Inicial */}
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
          href="/"
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
          🏠 Página Inicial
        </Link>
      </div>

      <header style={{ marginBottom: 16 }}>
        {!isEditing ? (
          <>
            <h1 style={{ margin: 0 }}>{plant.name}</h1>

            <p style={{ marginTop: 8, color: "#444" }}>
              📍 Local: <strong>{plant.place ?? "—"}</strong>
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

              <label style={{ display: "grid", gap: 6 }}>
                <span>Local (opcional)</span>
                <input
                  value={editPlace}
                  onChange={(e) => setEditPlace(e.target.value)}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
                />
              </label>

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
        <h2 style={{ marginTop: 0 }}>Histórico de regas</h2>

        {plant.waterings.length === 0 ? (
          <p>Nenhum registro ainda. Use “Reguei agora” ou “Registrar rega manual”.</p>
        ) : (
          <ul style={{ paddingLeft: 18, margin: 0, display: "grid", gap: 8 }}>
            {plant.waterings.map((w, idx) => {
              const key = wateringKey(w);
              return (
                <li key={`${key}-${idx}`} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span>
                    {formatIsoToBrDate(w.dateIso)} às {w.time}
                  </span>

                  <button
                    onClick={() => removeWatering(key)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 10,
                      border: "1px solid #ccc",
                      cursor: "pointer",
                      background: "#fff",
                    }}
                    title="Remover registro"
                  >
                    Remover
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {editMsg && !isEditing && <div style={{ marginTop: 10, color: "#2e7d32", fontSize: 14 }}>{editMsg}</div>}
      </section>
    </main>
  );
}
