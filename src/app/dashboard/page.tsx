// src/app/dashboard/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { getOrCreateHousehold, type Household } from "@/lib/household";

type DbPlant = {
  id: string;
  household_id: string;
  name: string;

  // legado (string)
  place?: string | null;

  // novo (relacional)
  place_id?: string | null;

  // possíveis nomes de “frequência”
  frequency_days?: number | null;
  watering_interval_days?: number | null;

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
  event_time: string | null; // HH:mm:ss or HH:mm
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
  // b - a
  const a = dateIsoToUtcMs(aIso);
  const b = dateIsoToUtcMs(bIso);
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

type StatusKey = "semFrequencia" | "primeiraRega" | "emDia" | "hoje" | "atrasada";
type StatusInfo = { key: StatusKey; label: string; emoji: string };

function normalizeFrequencyDays(p: DbPlant): number | null {
  const a = typeof p.frequency_days === "number" ? p.frequency_days : null;
  const b = typeof p.watering_interval_days === "number" ? p.watering_interval_days : null;
  const v = a ?? b;
  if (!v || v <= 0) return null;
  return v;
}

function computeStatus(args: {
  frequencyDays: number | null;
  lastWaterDateIso: string | null;
  todayIso: string;
}): {
  status: StatusInfo;
  nextText: string;
  nextDateIso: string | null;
  deltaDays: number | null;
} {
  const { frequencyDays, lastWaterDateIso, todayIso } = args;

  if (!frequencyDays) {
    return {
      status: { key: "semFrequencia", label: "Sem frequência", emoji: "⚪" },
      nextText: "Frequência: —",
      nextDateIso: null,
      deltaDays: null,
    };
  }

  if (!lastWaterDateIso) {
    return {
      status: { key: "primeiraRega", label: "Primeira rega", emoji: "🔵" },
      nextText: `Frequência: a cada ${frequencyDays} dia(s) • Próxima: —`,
      nextDateIso: null,
      deltaDays: null,
    };
  }

  const nextIso = addDaysToIso(lastWaterDateIso, frequencyDays);
  const delta = diffDaysIso(todayIso, nextIso); // next - today

  if (delta < 0) {
    return {
      status: { key: "atrasada", label: "Atrasada", emoji: "🔴" },
      nextText: `Próxima: ${formatIsoToBrDate(nextIso)} • Atrasada há ${Math.abs(delta)} dia(s)`,
      nextDateIso: nextIso,
      deltaDays: delta,
    };
  }
  if (delta === 0) {
    return {
      status: { key: "hoje", label: "Hoje", emoji: "🟡" },
      nextText: `Próxima: ${formatIsoToBrDate(nextIso)} • Hoje`,
      nextDateIso: nextIso,
      deltaDays: delta,
    };
  }

  return {
    status: { key: "emDia", label: "Em dia", emoji: "🟢" },
    nextText: `Próxima: ${formatIsoToBrDate(nextIso)} • Faltam ${delta} dia(s)`,
    nextDateIso: nextIso,
    deltaDays: delta,
  };
}

type Mode = "idle" | "waterBatch" | "sunBatch";

type CardVM = {
  plant: DbPlant;
  freq: number | null;
  placeLabel: string | null;
  lastWaterDateIso: string | null;
  lastWaterTime: string | null;
  status: StatusInfo;
  nextText: string;
  nextDateIso: string | null;
  deltaDays: number | null;
};

function statusPriority(k: StatusKey) {
  // prioridade: atrasada -> hoje -> em dia -> primeira -> sem freq
  if (k === "atrasada") return 0;
  if (k === "hoje") return 1;
  if (k === "emDia") return 2;
  if (k === "primeiraRega") return 3;
  return 4;
}

function pillStyle(k: StatusKey): React.CSSProperties {
  // tons suaves (igual vibe do login)
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 30,
    padding: "0 10px",
    borderRadius: 999,
    border: "1px solid var(--pc-border)",
    background: "#fff",
    fontSize: 12,
    fontWeight: 900,
    color: "#111",
    whiteSpace: "nowrap",
  };

  if (k === "atrasada")
    return { ...base, background: "#ffe9e9", borderColor: "var(--pc-red-border)", color: "var(--pc-red-text)" };
  if (k === "hoje")
    return { ...base, background: "#fff7e6", borderColor: "#ffe2a8", color: "#7a4b00" };
  if (k === "emDia")
    return { ...base, background: "var(--pc-green-bg)", borderColor: "var(--pc-green-border)", color: "var(--pc-green-text)" };
  if (k === "primeiraRega")
    return { ...base, background: "#eaf2ff", borderColor: "#cfe0ff", color: "#1e3a8a" };

  return { ...base, background: "#f2f3f5", borderColor: "var(--pc-border-2)", color: "#374151" };
}

function smallLinkStyle(): React.CSSProperties {
  return { fontSize: 13, fontWeight: 800, textDecoration: "underline" };
}

export default function DashboardPage() {
  const router = useRouter();

  const [house, setHouse] = useState<Household | null>(null);

  const [plants, setPlants] = useState<DbPlant[]>([]);
  const [places, setPlaces] = useState<DbPlace[]>([]);
  const [events, setEvents] = useState<DbEvent[]>([]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("idle");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [savingBatch, setSavingBatch] = useState(false);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | StatusKey>("all");

  async function logout() {
    await supabaseBrowser.auth.signOut();
    router.replace("/login");
  }

  async function loadAll() {
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

      const plantsRes = await supabaseBrowser
        .from("plants")
        .select("*")
        .eq("household_id", h.id)
        .order("created_at", { ascending: false });

      if (plantsRes.error) throw plantsRes.error;
      setPlants((plantsRes.data ?? []) as DbPlant[]);

      const eventsRes = await supabaseBrowser
        .from("events")
        .select("*")
        .eq("household_id", h.id)
        .order("event_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(2000);

      if (eventsRes.error) throw eventsRes.error;
      setEvents((eventsRes.data ?? []) as DbEvent[]);
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao carregar dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const placeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of places) map.set(p.id, p.name);
    return map;
  }, [places]);

  const lastEventByPlantAndType = useMemo(() => {
    // plant_id -> { water?: DbEvent, sun?: DbEvent }
    const map = new Map<string, { water?: DbEvent; sun?: DbEvent }>();
    // events já vêm ordenados desc, então o primeiro encontrado é o mais recente
    for (const ev of events) {
      const cur = map.get(ev.plant_id) ?? {};
      if (ev.event_type === "water" && !cur.water) cur.water = ev;
      if (ev.event_type === "sun" && !cur.sun) cur.sun = ev;
      map.set(ev.plant_id, cur);
    }
    return map;
  }, [events]);

  const todayIso = useMemo(() => nowInBrasiliaParts().dateIso, []);

  const allCards: CardVM[] = useMemo(() => {
    return plants.map((p) => {
      const freq = normalizeFrequencyDays(p);

      const lastWaterEvent = lastEventByPlantAndType.get(p.id)?.water;
      const lastWaterDateIso = lastWaterEvent?.event_date ?? null;
      const lastWaterTime = lastWaterEvent?.event_time ?? null;

      const placeFromId = p.place_id ? placeNameById.get(p.place_id) ?? null : null;
      const placeLabel = placeFromId ?? (p.place ?? null);

      const { status, nextText, nextDateIso, deltaDays } = computeStatus({
        frequencyDays: freq,
        lastWaterDateIso,
        todayIso,
      });

      return {
        plant: p,
        freq,
        placeLabel,
        lastWaterDateIso,
        lastWaterTime,
        status,
        nextText,
        nextDateIso,
        deltaDays,
      };
    });
  }, [plants, lastEventByPlantAndType, placeNameById, todayIso]);

  const summaryAll = useMemo(() => {
    let atrasada = 0;
    let hoje = 0;
    let emDia = 0;
    let primeira = 0;
    let semFreq = 0;

    for (const c of allCards) {
      if (c.status.key === "atrasada") atrasada++;
      else if (c.status.key === "hoje") hoje++;
      else if (c.status.key === "emDia") emDia++;
      else if (c.status.key === "primeiraRega") primeira++;
      else semFreq++;
    }

    return { atrasada, hoje, emDia, primeira, semFreq, total: allCards.length };
  }, [allCards]);

  const filteredCards = useMemo(() => {
    const q = query.trim().toLowerCase();

    const filtered = allCards.filter((c) => {
      const matchesQuery =
        !q ||
        c.plant.name.toLowerCase().includes(q) ||
        (c.placeLabel ?? "").toLowerCase().includes(q);

      const matchesStatus = statusFilter === "all" ? true : c.status.key === statusFilter;

      return matchesQuery && matchesStatus;
    });

    return filtered.sort((a, b) => {
      const pa = statusPriority(a.status.key);
      const pb = statusPriority(b.status.key);
      if (pa !== pb) return pa - pb;

      if (a.deltaDays != null && b.deltaDays != null && a.deltaDays !== b.deltaDays) {
        return a.deltaDays - b.deltaDays;
      }

      return a.plant.name.localeCompare(b.plant.name, "pt-BR");
    });
  }, [allCards, query, statusFilter]);

  const batchActive = mode !== "idle";

  function clearSelection() {
    setSelected({});
  }

  function enterMode(next: Mode) {
    setMode(next);
    clearSelection();
  }

  function cancelBatch() {
    setMode("idle");
    clearSelection();
  }

  function toggleSelect(id: string) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
    [selected]
  );

  function selectAllVisible() {
    const next: Record<string, boolean> = {};
    for (const c of filteredCards) next[c.plant.id] = true;
    setSelected(next);
  }

  async function confirmBatch() {
    if (!house) return;

    if (selectedIds.length === 0) {
      alert("Selecione ao menos 1 planta.");
      return;
    }

    const ok = window.confirm(
      `${mode === "waterBatch" ? "Registrar REGA" : "Registrar SOL"} para ${selectedIds.length} planta(s)?`
    );
    if (!ok) return;

    setSavingBatch(true);
    setErr(null);

    try {
      const { data: userData } = await supabaseBrowser.auth.getUser();
      const userId = userData?.user?.id ?? null;

      const { dateIso, timeBr } = nowInBrasiliaParts();

      const payload = selectedIds.map((plantId) => ({
        household_id: house.id,
        plant_id: plantId,
        event_type: mode === "waterBatch" ? "water" : "sun",
        event_date: dateIso,
        event_time: timeBr,
        created_by: userId,
        meta: {},
      }));

      const ins = await supabaseBrowser.from("events").insert(payload);
      if (ins.error) throw ins.error;

      const eventsRes = await supabaseBrowser
        .from("events")
        .select("*")
        .eq("household_id", house.id)
        .order("event_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(2000);

      if (eventsRes.error) throw eventsRes.error;
      setEvents((eventsRes.data ?? []) as DbEvent[]);

      setMode("idle");
      clearSelection();
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao salvar eventos em lote.");
    } finally {
      setSavingBatch(false);
    }
  }

  function FilterChip(props: {
    id: "all" | StatusKey;
    label: string;
    emoji: string;
    count: number;
  }) {
    const active = statusFilter === props.id;

    const style: React.CSSProperties = active
      ? {
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          height: 34,
          padding: "0 12px",
          borderRadius: 999,
          border: "1px solid #111",
          background: "#111",
          color: "#fff",
          fontSize: 13,
          fontWeight: 900,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }
      : {
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          height: 34,
          padding: "0 12px",
          borderRadius: 999,
          border: "1px solid var(--pc-border)",
          background: "#fff",
          color: "#111",
          fontSize: 13,
          fontWeight: 900,
          cursor: "pointer",
          whiteSpace: "nowrap",
        };

    return (
      <button type="button" onClick={() => setStatusFilter(props.id)} style={style} title="Filtrar">
        <span aria-hidden>{props.emoji}</span>
        <span>{props.label}</span>
        <span style={{ opacity: active ? 0.9 : 0.75, fontWeight: 900 }}>({props.count})</span>
      </button>
    );
  }

  return (
    <main className="pc-page">
      <div className="pc-container" style={{ display: "grid", gap: 12 }}>
        {/* Header (igual ao login: logo + nome) */}
        <div className="pc-card">
          <div className="pc-between" style={{ alignItems: "flex-start" }}>
            <div className="pc-row" style={{ alignItems: "flex-start" }}>
              <div className="pc-logo" aria-hidden>
                🌿
              </div>
              <div style={{ lineHeight: 1.1 }}>
                <div className="pc-title">PlantaCheck</div>
                <div className="pc-subtitle">
                  Dashboard • Casa: <b>{house?.name ?? "..."}</b>
                </div>
              </div>
            </div>

            <div className="pc-row" style={{ gap: 12 }}>
              <button type="button" className="pc-btn-link" onClick={loadAll}>
                Recarregar
              </button>
              <button type="button" className="pc-btn-link" onClick={logout}>
                Sair
              </button>
            </div>
          </div>

          {err && <div className="pc-alert-error">{err}</div>}

          {/* Busca */}
          <div style={{ marginTop: 14, display: "grid", gap: 6 }}>
            <div className="pc-label">Buscar (nome ou ambiente)</div>
            <input
              className="pc-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ex: varanda, jiboia..."
            />
          </div>

          {/* Chips de filtro (bonitinho e compacto) */}
          <div style={{ marginTop: 12, display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
            <FilterChip id="all" label="Todas" emoji="📌" count={summaryAll.total} />
            <FilterChip id="atrasada" label="Atrasadas" emoji="🔴" count={summaryAll.atrasada} />
            <FilterChip id="hoje" label="Hoje" emoji="🟡" count={summaryAll.hoje} />
            <FilterChip id="emDia" label="Em dia" emoji="🟢" count={summaryAll.emDia} />
            <FilterChip id="primeiraRega" label="1ª rega" emoji="🔵" count={summaryAll.primeira} />
            <FilterChip id="semFrequencia" label="Sem freq." emoji="⚪" count={summaryAll.semFreq} />
          </div>
        </div>

        {/* Ações em lote (com botões iguais ao login) */}
        <div className="pc-card">
          <div className="pc-between" style={{ alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 950, color: "#111" }}>Ações em lote</div>
              <div className="pc-subtitle" style={{ marginTop: 6 }}>
                Selecione plantas e registre um evento (rega ou sol) de uma vez.
              </div>
            </div>

            {batchActive ? (
              <div className="pc-chip" style={{ fontSize: 12 }}>
                Selecionadas: <b>{selectedIds.length}</b>
              </div>
            ) : null}
          </div>

          {!batchActive ? (
            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              <button type="button" className="pc-btn-primary" onClick={() => enterMode("waterBatch")}>
                💧 Regar Agora
              </button>
              <button type="button" className="pc-btn-secondary" onClick={() => enterMode("sunBatch")}>
                ☀️ Sol Agora
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              <button
                type="button"
                className="pc-btn-primary"
                onClick={confirmBatch}
                disabled={savingBatch}
                style={{ opacity: savingBatch ? 0.7 : 1, cursor: savingBatch ? "not-allowed" : "pointer" }}
              >
                {savingBatch ? "Salvando..." : "✅ Confirmar"}
              </button>

              <button
                type="button"
                className="pc-btn-secondary"
                onClick={cancelBatch}
                disabled={savingBatch}
                style={{ opacity: savingBatch ? 0.7 : 1, cursor: savingBatch ? "not-allowed" : "pointer" }}
              >
                ❌ Cancelar
              </button>

              <div className="pc-between" style={{ marginTop: 2 }}>
                <button type="button" className="pc-btn-secondary" onClick={selectAllVisible}>
                  Selecionar todas (visíveis)
                </button>
                <button type="button" className="pc-btn-secondary" onClick={clearSelection}>
                  Limpar
                </button>
              </div>
            </div>
          )}

          <div className="pc-subtitle" style={{ marginTop: 12 }}>
            Exibindo <b>{filteredCards.length}</b> de <b>{summaryAll.total}</b>.
            {batchActive ? (
              <>
                {" "}
                • Modo: <b>{mode === "waterBatch" ? "REGAR" : "SOL"}</b>
              </>
            ) : null}
          </div>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="pc-card">
            <div className="pc-subtitle">Carregando...</div>
          </div>
        ) : filteredCards.length === 0 ? (
          <div className="pc-card">
            <div className="pc-subtitle">Nenhuma planta encontrada com os filtros atuais.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {filteredCards.map((c) => {
              const p = c.plant;

              const lastLine = c.lastWaterDateIso
                ? `Última rega: ${formatIsoToBrDate(c.lastWaterDateIso)}${
                    c.lastWaterTime ? ` às ${String(c.lastWaterTime).slice(0, 5)}` : ""
                  }`
                : "Última rega: —";

              const checked = Boolean(selected[p.id]);

              return (
                <div
                  key={p.id}
                  className="pc-card"
                  onClick={() => {
                    // no modo lote, tocar no card também seleciona (facilita no celular)
                    if (batchActive) toggleSelect(p.id);
                  }}
                  style={{ cursor: batchActive ? "pointer" : "default" }}
                >
                  <div className="pc-between" style={{ alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="pc-between" style={{ alignItems: "flex-start" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            {batchActive ? (
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleSelect(p.id)}
                                onClick={(e) => e.stopPropagation()}
                                style={{ width: 18, height: 18 }}
                                aria-label={`Selecionar ${p.name}`}
                              />
                            ) : null}

                            <div style={{ fontSize: 16, fontWeight: 950, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>
                              {p.name}
                            </div>

                            <span style={pillStyle(c.status.key)}>
                              <span aria-hidden>{c.status.emoji}</span>
                              <span>{c.status.label}</span>
                            </span>
                          </div>

                          <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                            <div className="pc-subtitle">🗓️ {c.nextText}</div>
                            <div className="pc-subtitle">💧 {lastLine}</div>
                            <div className="pc-subtitle">
                              📍 {c.placeLabel ?? "(sem ambiente)"}{" "}
                              {c.freq ? (
                                <span style={{ opacity: 0.8, fontWeight: 800 }}>• 💧 {c.freq}d</span>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        {!batchActive ? (
                          <Link href={`/planta/${p.id}`} style={smallLinkStyle()}>
                            Ver detalhes →
                          </Link>
                        ) : (
                          <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.7 }}>
                            {checked ? "Selecionada" : "Toque para selecionar"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Atalhos / navegação simples */}
        <div className="pc-card">
          <div className="pc-between">
            <Link href="/plants" style={smallLinkStyle()}>
              🌿 Plantas
            </Link>
            <Link href="/house" style={smallLinkStyle()}>
              🏠 Casa
            </Link>
          </div>
        </div>

        {/* Espaço final para não “colar” no bottom nav (se existir) */}
        <div style={{ height: 24 }} />
      </div>
    </main>
  );
}