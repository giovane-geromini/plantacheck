"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { getOrCreateHousehold, type Household } from "@/lib/household";
import AppCard from "@/components/AppCard";

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
  const [, m, d] = dateIso.split("-");
  const y = dateIso.slice(0, 4);
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
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 30,
    padding: "0 10px",
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#d7dbe0",
    background: "#fff",
    fontSize: 12,
    fontWeight: 900,
    color: "#111",
    whiteSpace: "nowrap",
  };

  if (k === "atrasada") return { ...base, background: "#ffe9e9", borderColor: "#ffd0d0", color: "#7a1b1b" };
  if (k === "hoje") return { ...base, background: "#fff7e6", borderColor: "#ffe2a8", color: "#7a4b00" };
  if (k === "emDia") return { ...base, background: "#e9fff0", borderColor: "#cfe9d7", color: "#14532d" };
  if (k === "primeiraRega") return { ...base, background: "#eaf2ff", borderColor: "#cfe0ff", color: "#1e3a8a" };

  return { ...base, background: "#f2f3f5", borderColor: "#e6e8eb", color: "#374151" };
}

const label: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: "#111",
};

const input: React.CSSProperties = {
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

type ChipProps = { id: "all" | StatusKey; label: string; emoji: string; count: number };

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
    const map = new Map<string, { water?: DbEvent; sun?: DbEvent }>();
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
        !q || c.plant.name.toLowerCase().includes(q) || (c.placeLabel ?? "").toLowerCase().includes(q);

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

  const selectedIds = useMemo(() => Object.entries(selected).filter(([, v]) => v).map(([k]) => k), [selected]);

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

  function FilterChip(props: ChipProps) {
    const active = statusFilter === props.id;

    return (
      <button
        type="button"
        onClick={() => setStatusFilter(props.id)}
        className={`pc-chip-btn ${active ? "is-active" : ""}`}
        title="Filtrar"
      >
        <span aria-hidden>{props.emoji}</span>
        <span>{props.label}</span>
        <span className="pc-chip-count">({props.count})</span>
      </button>
    );
  }

  return (
    <AppCard title="PlantaCheck" subtitle={`Dashboard • Casa: ${house?.name ?? "..."}`} icon="🌿" maxWidth={460}>
      {err ? (
        <div
          style={{
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
          }}
        >
          {err}
        </div>
      ) : null}

      {/* busca */}
      <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
        <div style={label}>Buscar (nome ou ambiente)</div>
        <input
          style={input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ex: varanda, jiboia..."
        />
      </div>

      {/* chips */}
      <div className="pc-chips">
        <FilterChip id="all" label="Todas" emoji="📌" count={summaryAll.total} />
        <FilterChip id="atrasada" label="Atrasadas" emoji="🔴" count={summaryAll.atrasada} />
        <FilterChip id="hoje" label="Hoje" emoji="🟡" count={summaryAll.hoje} />
        <FilterChip id="emDia" label="Em dia" emoji="🟢" count={summaryAll.emDia} />
        <FilterChip id="primeiraRega" label="1ª rega" emoji="🔵" count={summaryAll.primeira} />
        <FilterChip id="semFrequencia" label="Sem freq." emoji="⚪" count={summaryAll.semFreq} />
      </div>

      {/* Ações em lote */}
      <AppCard noCenter style={{ padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 950, color: "#111" }}>Ações em lote</div>
            <div style={{ fontSize: 13, color: "#4b5563", marginTop: 6 }}>
              Selecione plantas e registre um evento (rega ou sol) de uma vez.
            </div>
          </div>

          {batchActive ? (
            <div
              style={{
                height: 32,
                padding: "0 10px",
                borderRadius: 999,
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: "#e6e8eb",
                background: "#f2f3f5",
                display: "inline-flex",
                alignItems: "center",
                fontSize: 12,
                fontWeight: 900,
                color: "#111",
                whiteSpace: "nowrap",
              }}
            >
              Selecionadas: <span style={{ marginLeft: 6 }}>{selectedIds.length}</span>
            </div>
          ) : null}
        </div>

        {!batchActive ? (
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            <button type="button" style={primaryBtn} onClick={() => enterMode("waterBatch")}>
              💧 Regar Agora
            </button>
            <button type="button" style={secondaryBtn} onClick={() => enterMode("sunBatch")}>
              ☀️ Sol Agora
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            <button
              type="button"
              style={{
                ...primaryBtn,
                opacity: savingBatch ? 0.7 : 1,
                cursor: savingBatch ? "not-allowed" : "pointer",
              }}
              onClick={confirmBatch}
              disabled={savingBatch}
            >
              {savingBatch ? "Salvando..." : "✅ Confirmar"}
            </button>

            <button
              type="button"
              style={{
                ...secondaryBtn,
                opacity: savingBatch ? 0.7 : 1,
                cursor: savingBatch ? "not-allowed" : "pointer",
              }}
              onClick={cancelBatch}
              disabled={savingBatch}
            >
              ❌ Cancelar
            </button>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button type="button" style={secondaryBtn} onClick={selectAllVisible}>
                Selecionar visíveis
              </button>
              <button type="button" style={secondaryBtn} onClick={clearSelection}>
                Limpar
              </button>
            </div>
          </div>
        )}

        <div style={{ fontSize: 13, color: "#4b5563", marginTop: 12 }}>
          Exibindo <b>{filteredCards.length}</b> de <b>{summaryAll.total}</b>.
          {batchActive ? (
            <>
              {" "}
              • Modo: <b>{mode === "waterBatch" ? "REGAR" : "SOL"}</b>
            </>
          ) : null}
        </div>
      </AppCard>

      {/* lista */}
      <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
        {loading ? (
          <AppCard noCenter style={{ padding: 14 }}>
            <div style={{ fontSize: 13, color: "#4b5563", fontWeight: 800 }}>Carregando...</div>
          </AppCard>
        ) : filteredCards.length === 0 ? (
          <AppCard noCenter style={{ padding: 14 }}>
            <div style={{ fontSize: 13, color: "#4b5563", fontWeight: 800 }}>
              Nenhuma planta encontrada com os filtros atuais.
            </div>
          </AppCard>
        ) : (
          filteredCards.map((c) => {
            const p = c.plant;

            const lastLine = c.lastWaterDateIso
              ? `Última rega: ${formatIsoToBrDate(c.lastWaterDateIso)}${
                  c.lastWaterTime ? ` às ${String(c.lastWaterTime).slice(0, 5)}` : ""
                }`
              : "Última rega: —";

            const checked = Boolean(selected[p.id]);

            return (
              <AppCard
                key={p.id}
                noCenter
                style={{
                  padding: 14,
                  cursor: batchActive ? "pointer" : "default",
                }}
              >
                <div
                  onClick={() => {
                    if (batchActive) toggleSelect(p.id);
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      {/* Linha 1: Nome (sempre) */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
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

                        <div
                          style={{
                            fontSize: 16,
                            fontWeight: 950,
                            color: "#111",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: 260,
                          }}
                          title={p.name}
                        >
                          🌿 {p.name}
                        </div>
                      </div>

                      {/* Linha 2: Status (sempre abaixo) */}
                      <div style={{ marginTop: 8 }}>
                        <span style={pillStyle(c.status.key)}>
                          <span aria-hidden>{c.status.emoji}</span>
                          <span>{c.status.label}</span>
                        </span>
                      </div>

                      <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                        <div style={{ fontSize: 13, color: "#4b5563", fontWeight: 700 }}>🗓️ {c.nextText}</div>
                        <div style={{ fontSize: 13, color: "#4b5563", fontWeight: 700 }}>💧 {lastLine}</div>
                        <div style={{ fontSize: 13, color: "#4b5563", fontWeight: 700 }}>
                          📍 {c.placeLabel ?? "(sem ambiente)"}{" "}
                          {c.freq ? <span style={{ opacity: 0.9, fontWeight: 900 }}>• 💧 {c.freq}d</span> : null}
                        </div>
                      </div>
                    </div>

                    {!batchActive ? (
                      <Link href={`/planta/${p.id}`} style={detailsBtnSmall} aria-label={`Ver detalhes de ${p.name}`}>
                        Ver detalhes <span aria-hidden>→</span>
                      </Link>
                    ) : (
                      <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.7 }}>
                        {checked ? "Selecionada" : "Toque p/ selecionar"}
                      </span>
                    )}
                  </div>
                </div>
              </AppCard>
            );
          })
        )}
      </div>

      {/* acesso secundário (sem ficar no BottomNav) */}
      <AppCard noCenter style={{ padding: 14, marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 13, color: "#4b5563", fontWeight: 800 }}>Acesso rápido</div>
          <Link href="/house" style={detailsBtnSmall}>
            🏠 Casa <span aria-hidden>→</span>
          </Link>
        </div>
      </AppCard>

      {/* respiro para o BottomNav não cobrir */}
      <div style={{ height: 120 }} />
    </AppCard>
  );
}