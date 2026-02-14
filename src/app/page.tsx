"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import InstallPwaButton from "@/components/InstallPwaButton";
import { supabase } from "@/lib/supabaseClient";

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

// ===== Persistência =====
function loadPlantsFromStorage(): Plant[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed as Plant[];
  } catch {
    return null;
  }
}
function savePlantsToStorage(plants: Plant[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plants));
  } catch {}
}

// ===== Datas/Horas BR =====
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
  // b - a
  const a = dateIsoToUtcMs(aIso);
  const b = dateIsoToUtcMs(bIso);
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

function todayIsoBrasilia() {
  return nowInBrasiliaParts().dateIso;
}

// ===== Próxima rega =====
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
    return {
      kind: "noLast",
      text: `Frequência: a cada ${p.frequencyDays} dia(s) • Próxima: —`,
    };
  }

  const nextIso = addDaysToIso(p.lastWateredDateIso, p.frequencyDays);
  const todayIso = todayIsoBrasilia();
  const delta = diffDaysIso(todayIso, nextIso); // next - today

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

// ===== Status =====
type StatusKey = "semRega" | "emDia" | "atencao" | "urgente";
type StatusInfo = { key: StatusKey; label: string; emoji: string };

function statusForPlant(p: Plant): StatusInfo {
  if (!p.lastWateredDateIso)
    return { key: "semRega", label: "Sem registro", emoji: "⚪" };

  if (p.frequencyDays && p.frequencyDays > 0) {
    const next = getNextWaterInfo(p);
    if (next.kind === "ok") {
      if (next.isOverdue) return { key: "urgente", label: "Atrasada", emoji: "🔴" };
      if (next.isToday) return { key: "atencao", label: "Hoje", emoji: "🟡" };
      return { key: "emDia", label: "Em dia", emoji: "🟢" };
    }
  }

  const todayIso = todayIsoBrasilia();
  const days = diffDaysIso(p.lastWateredDateIso, todayIso);
  if (days <= 2) return { key: "emDia", label: "Em dia", emoji: "🟢" };
  if (days <= 5) return { key: "atencao", label: "Atenção", emoji: "🟡" };
  return { key: "urgente", label: "Regar urgente", emoji: "🔴" };
}

const STATUS_FILTERS: { key: "all" | StatusKey; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "semRega", label: "⚪ Sem registro" },
  { key: "emDia", label: "🟢 Em dia" },
  { key: "atencao", label: "🟡 Atenção/Hoje" },
  { key: "urgente", label: "🔴 Atrasada/Urgente" },
];

type SortKey = "urgentePrimeiro" | "recentesPrimeiro" | "nomeAZ";

function urgencyScore(p: Plant) {
  if (!p.lastWateredDateIso) return 10_000;

  const next = getNextWaterInfo(p);
  if (next.kind === "ok") {
    if (next.deltaDays < 0) return 5_000 + Math.abs(next.deltaDays);
    if (next.deltaDays === 0) return 2_500;
    return 100 - next.deltaDays;
  }

  const todayIso = todayIsoBrasilia();
  return diffDaysIso(p.lastWateredDateIso, todayIso);
}

function compareBySort(a: Plant, b: Plant, sort: SortKey) {
  if (sort === "urgentePrimeiro") {
    const sa = urgencyScore(a);
    const sb = urgencyScore(b);
    if (sb !== sa) return sb - sa;
    return a.name.localeCompare(b.name, "pt-BR");
  }

  if (sort === "recentesPrimeiro") {
    const aHas = Boolean(a.lastWateredDateIso);
    const bHas = Boolean(b.lastWateredDateIso);
    if (aHas !== bHas) return aHas ? -1 : 1;

    if (!a.lastWateredDateIso || !b.lastWateredDateIso)
      return a.name.localeCompare(b.name, "pt-BR");

    const todayIso = todayIsoBrasilia();
    const da = diffDaysIso(a.lastWateredDateIso, todayIso);
    const db = diffDaysIso(b.lastWateredDateIso, todayIso);
    if (da !== db) return da - db;
    return a.name.localeCompare(b.name, "pt-BR");
  }

  return a.name.localeCompare(b.name, "pt-BR");
}

const INITIAL_PLANTS: Plant[] = [
  {
    id: "1",
    name: "Jiboia",
    place: "Sala",
    lastWateredDateIso: "2026-02-10",
    lastWateredTime: "09:30",
    waterings: [{ dateIso: "2026-02-10", time: "09:30" }],
    frequencyDays: 3,
  },
  {
    id: "2",
    name: "Espada-de-São-Jorge",
    place: "Varanda",
    lastWateredDateIso: "2026-02-05",
    lastWateredTime: "18:10",
    waterings: [{ dateIso: "2026-02-05", time: "18:10" }],
    frequencyDays: 14,
  },
  {
    id: "3",
    name: "Zamioculca",
    place: "Quarto",
    lastWateredDateIso: "2026-02-12",
    lastWateredTime: "07:45",
    waterings: [{ dateIso: "2026-02-12", time: "07:45" }],
    frequencyDays: 7,
  },
];

type QuickTab = "all" | "first" | "today" | "overdue";

export default function Home() {
  const router = useRouter();

  // ===== Auth gate =====
  const [authChecked, setAuthChecked] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // ===== App state =====
  const [plants, setPlants] = useState<Plant[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const [name, setName] = useState("");
  const [place, setPlace] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPlace, setEditPlace] = useState("");

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | StatusKey>("all");
  const [sortBy, setSortBy] = useState<SortKey>("urgentePrimeiro");

  const [quickTab, setQuickTab] = useState<QuickTab>("all");

  useEffect(() => {
    // Checa sessão atual
    supabase.auth.getSession().then(({ data }) => {
      const session = data.session;
      if (!session) {
        router.replace("/login");
        return;
      }
      setUserEmail(session.user.email ?? null);
      setAuthChecked(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace("/login");
        return;
      }
      setUserEmail(session.user.email ?? null);
      setAuthChecked(true);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (!authChecked) return;

    const fromStorage = loadPlantsFromStorage();
    if (fromStorage) setPlants(fromStorage);
    else setPlants(INITIAL_PLANTS);
    setHydrated(true);
  }, [authChecked]);

  useEffect(() => {
    if (!hydrated) return;
    savePlantsToStorage(plants);
  }, [plants, hydrated]);

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  function waterNow(plantId: string) {
    const { dateIso, timeBr } = nowInBrasiliaParts();
    const newW: Watering = { dateIso, time: timeBr };

    setPlants((prev) =>
      prev.map((p) => {
        if (p.id !== plantId) return p;
        return {
          ...p,
          lastWateredDateIso: dateIso,
          lastWateredTime: timeBr,
          waterings: [newW, ...p.waterings],
        };
      })
    );
  }

  function addPlant(e: React.FormEvent) {
    e.preventDefault();

    const trimmedName = name.trim();
    const trimmedPlace = place.trim();

    if (!trimmedName) {
      setFormError("Informe o nome da planta.");
      return;
    }

    setFormError(null);

    const newPlant: Plant = {
      id: crypto.randomUUID(),
      name: trimmedName,
      place: trimmedPlace ? trimmedPlace : undefined,
      lastWateredDateIso: undefined,
      lastWateredTime: undefined,
      waterings: [],
      frequencyDays: undefined,
    };

    setPlants((prev) => [newPlant, ...prev]);
    setName("");
    setPlace("");
  }

  function removePlant(plantId: string) {
    const plant = plants.find((p) => p.id === plantId);
    const ok = window.confirm(`Remover "${plant?.name ?? "esta planta"}"?`);
    if (!ok) return;

    setPlants((prev) => prev.filter((p) => p.id !== plantId));

    if (editingId === plantId) {
      setEditingId(null);
      setEditPlace("");
    }
  }

  function startEditPlace(plantId: string) {
    const plant = plants.find((p) => p.id === plantId);
    setEditingId(plantId);
    setEditPlace(plant?.place ?? "");
  }

  function cancelEditPlace() {
    setEditingId(null);
    setEditPlace("");
  }

  function saveEditPlace(plantId: string) {
    const trimmed = editPlace.trim();
    setPlants((prev) =>
      prev.map((p) =>
        p.id === plantId ? { ...p, place: trimmed ? trimmed : undefined } : p
      )
    );
    setEditingId(null);
    setEditPlace("");
  }

  const counts = useMemo(() => {
    let first = 0;
    let today = 0;
    let overdue = 0;

    for (const p of plants) {
      const hasFreq = Boolean(p.frequencyDays && p.frequencyDays > 0);
      const hasLast = Boolean(p.lastWateredDateIso);

      if (hasFreq && !hasLast) first += 1;

      const next = getNextWaterInfo(p);
      if (next.kind !== "ok") continue;
      if (next.isToday) today += 1;
      if (next.isOverdue) overdue += 1;
    }

    return { first, today, overdue };
  }, [plants]);

  useEffect(() => {
    if (counts.first === 0 && quickTab === "first") setQuickTab("all");
  }, [counts.first, quickTab]);

  const visiblePlants = useMemo(() => {
    const q = query.trim().toLowerCase();

    const filtered = plants.filter((p) => {
      if (quickTab !== "all") {
        if (quickTab === "first") {
          const hasFreq = Boolean(p.frequencyDays && p.frequencyDays > 0);
          const hasLast = Boolean(p.lastWateredDateIso);
          if (!(hasFreq && !hasLast)) return false;
        } else {
          const next = getNextWaterInfo(p);
          if (next.kind !== "ok") return false;
          if (quickTab === "today" && !next.isToday) return false;
          if (quickTab === "overdue" && !next.isOverdue) return false;
        }
      }

      const st = statusForPlant(p);

      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.place ?? "").toLowerCase().includes(q);

      const matchesStatus = statusFilter === "all" ? true : st.key === statusFilter;

      return matchesQuery && matchesStatus;
    });

    return filtered.sort((a, b) => compareBySort(a, b, sortBy));
  }, [plants, query, statusFilter, sortBy, quickTab]);

  function chipStyle(active: boolean) {
    return {
      padding: "8px 12px",
      borderRadius: 999,
      border: "1px solid #ccc",
      cursor: "pointer",
      background: active ? "#f7f7f7" : "#fff",
      display: "inline-flex",
      gap: 8,
      alignItems: "center",
      userSelect: "none" as const,
    };
  }

  function badgeStyle() {
    return {
      minWidth: 22,
      height: 22,
      borderRadius: 999,
      border: "1px solid #ccc",
      padding: "0 6px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 12,
      background: "#fff",
    };
  }

  if (!authChecked) {
    return (
      <main style={{ padding: 24, fontFamily: "Arial, sans-serif" }}>
        <p>Verificando login...</p>
      </main>
    );
  }

  return (
    <>
      <main
        style={{
          padding: "clamp(16px, 3vw, 32px)",
          fontFamily: "Arial, sans-serif",
          maxWidth: 1400,
          margin: "0 auto",
        }}
      >
        {!hydrated ? (
          <p>Carregando...</p>
        ) : (
          <>
            <header style={{ marginBottom: "1.2rem", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
              <div>
                <h1 style={{ margin: 0 }}>🌱 PlantaCheck</h1>
                <p style={{ marginTop: 8, color: "#444" }}>
                  Controle Inteligente para Plantas Saudáveis
                </p>
                {userEmail && (
                  <div style={{ fontSize: 12, color: "#666" }}>
                    Logado como: <strong>{userEmail}</strong>
                  </div>
                )}
              </div>

              <button
                onClick={logout}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  cursor: "pointer",
                  background: "#fff",
                  height: "fit-content",
                }}
                title="Sair"
              >
                Sair
              </button>
            </header>

            {/* Atalhos */}
            <section
              style={{
                border: "1px solid #ddd",
                borderRadius: 12,
                padding: 16,
                background: "white",
                marginBottom: 16,
              }}
            >
              <h2 style={{ marginTop: 0 }}>Atalhos</h2>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <button style={chipStyle(quickTab === "all")} onClick={() => setQuickTab("all")}>
                  Todos
                </button>

                {counts.first > 0 && (
                  <button style={chipStyle(quickTab === "first")} onClick={() => setQuickTab("first")}>
                    Primeira rega <span style={badgeStyle()}>{counts.first}</span>
                  </button>
                )}

                <button style={chipStyle(quickTab === "today")} onClick={() => setQuickTab("today")}>
                  Hoje <span style={badgeStyle()}>{counts.today}</span>
                </button>

                <button style={chipStyle(quickTab === "overdue")} onClick={() => setQuickTab("overdue")}>
                  Atrasadas <span style={badgeStyle()}>{counts.overdue}</span>
                </button>
              </div>
            </section>

            {/* Formulário */}
            <section
              style={{
                border: "1px solid #ddd",
                borderRadius: 12,
                padding: 16,
                background: "white",
                marginBottom: 16,
              }}
            >
              <h2 style={{ marginTop: 0 }}>Adicionar planta</h2>

              <form onSubmit={addPlant} style={{ display: "grid", gap: 10 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span>Nome *</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex.: Jiboia"
                    style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
                  />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span>Local (opcional)</span>
                  <input
                    value={place}
                    onChange={(e) => setPlace(e.target.value)}
                    placeholder="Ex.: Sala, Varanda..."
                    style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
                  />
                </label>

                {formError && <div style={{ color: "crimson", fontSize: 14 }}>{formError}</div>}

                <button
                  type="submit"
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #ccc",
                    cursor: "pointer",
                    background: "#f7f7f7",
                    width: "fit-content",
                  }}
                >
                  + Adicionar
                </button>
              </form>
            </section>

            {/* Controles */}
            <section
              style={{
                border: "1px solid #ddd",
                borderRadius: 12,
                padding: 16,
                background: "white",
                marginBottom: 16,
              }}
            >
              <h2 style={{ marginTop: 0 }}>Filtros</h2>

              <div style={{ display: "grid", gap: 10 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span>Buscar (nome ou local)</span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ex.: varanda, jiboia..."
                    style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
                  />
                </label>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span>Status</span>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as any)}
                      style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
                    >
                      {STATUS_FILTERS.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={{ display: "grid", gap: 6 }}>
                    <span>Ordenar</span>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortKey)}
                      style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
                    >
                      <option value="urgentePrimeiro">🔴 Mais urgente primeiro</option>
                      <option value="recentesPrimeiro">💧 Regadas mais recentes primeiro</option>
                      <option value="nomeAZ">🔤 Nome (A-Z)</option>
                    </select>
                  </label>

                  <button
                    onClick={() => {
                      setQuery("");
                      setStatusFilter("all");
                      setSortBy("urgentePrimeiro");
                      setQuickTab("all");
                    }}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #ccc",
                      cursor: "pointer",
                      background: "#fff",
                      height: 42,
                      marginTop: 22,
                    }}
                    title="Limpar filtros"
                  >
                    Limpar
                  </button>
                </div>

                <div style={{ color: "#555", fontSize: 14 }}>
                  Exibindo <strong>{visiblePlants.length}</strong> de <strong>{plants.length}</strong>.
                </div>
              </div>
            </section>

            {/* Lista */}
            <section>
              <h2 style={{ marginBottom: 12 }}>Minhas plantas</h2>

              {visiblePlants.length === 0 ? (
                <p>Nenhuma planta encontrada com os filtros atuais.</p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
                  {visiblePlants.map((p) => {
                    const st = statusForPlant(p);

                    const lastLine = p.lastWateredDateIso
                      ? `💧 Última rega: ${formatIsoToBrDate(p.lastWateredDateIso)} às ${p.lastWateredTime ?? "—"}`
                      : "💧 Última rega: —";

                    const nextInfo = getNextWaterInfo(p);

                    return (
                      <li
                        key={p.id}
                        style={{
                          border: "1px solid #ddd",
                          borderRadius: 12,
                          padding: 0,
                          background: "white",
                          overflow: "hidden",
                        }}
                      >
                        <Link
                          href={`/planta/${p.id}`}
                          style={{
                            display: "block",
                            padding: 16,
                            color: "inherit",
                            textDecoration: "none",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                            <div>
                              <strong style={{ fontSize: 18 }}>{p.name}</strong>

                              <div style={{ marginTop: 8, color: "#333" }}>
                                <div>
                                  {st.emoji} <strong>{st.label}</strong>
                                </div>

                                <div style={{ marginTop: 6 }}>{lastLine}</div>

                                <div style={{ marginTop: 6, color: "#444" }}>🗓️ {nextInfo.text}</div>

                                <div style={{ marginTop: 6 }}>
                                  📍 Local: <strong>{p.place ?? "—"}</strong>
                                </div>
                              </div>
                            </div>

                            <div style={{ color: "#666", fontSize: 14 }}>Ver detalhes →</div>
                          </div>
                        </Link>

                        <div
                          style={{
                            borderTop: "1px solid #eee",
                            padding: 12,
                            display: "flex",
                            gap: 10,
                            flexWrap: "wrap",
                            alignItems: "center",
                          }}
                        >
                          <button
                            onClick={() => waterNow(p.id)}
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

                          {editingId !== p.id ? (
                            <button
                              onClick={() => startEditPlace(p.id)}
                              style={{
                                padding: "10px 12px",
                                borderRadius: 10,
                                border: "1px solid #ccc",
                                cursor: "pointer",
                                background: "#fff",
                              }}
                            >
                              ✏️ Editar local
                            </button>
                          ) : (
                            <>
                              <input
                                value={editPlace}
                                onChange={(e) => setEditPlace(e.target.value)}
                                placeholder="Ex.: Sala, Varanda..."
                                style={{
                                  padding: 10,
                                  borderRadius: 10,
                                  border: "1px solid #ccc",
                                  minWidth: 220,
                                }}
                              />
                              <button
                                onClick={() => saveEditPlace(p.id)}
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
                                onClick={cancelEditPlace}
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
                            onClick={() => removePlant(p.id)}
                            style={{
                              padding: "10px 12px",
                              borderRadius: 10,
                              border: "1px solid #ccc",
                              cursor: "pointer",
                              background: "#fff",
                              marginLeft: "auto",
                            }}
                            title="Remover planta"
                          >
                            🗑️ Remover
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* ✅ Rodapé discreto */}
            <footer style={{ marginTop: 28, paddingTop: 14, borderTop: "1px solid #eee", color: "#666", fontSize: 13 }}>
              <Link href="/backup" style={{ color: "inherit", textDecoration: "underline" }}>
                Backup e exportações
              </Link>
            </footer>
          </>
        )}
      </main>

      {/* ✅ Botão flutuante do PWA (só aparece quando disponível) */}
      <InstallPwaButton />
    </>
  );
}
