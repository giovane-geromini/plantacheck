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

function statusPillClass(k: StatusKey) {
  // sem cores agressivas; só “tons” via classes neutras
  if (k === "atrasada") return "bg-red-50 border-red-200";
  if (k === "hoje") return "bg-amber-50 border-amber-200";
  if (k === "emDia") return "bg-emerald-50 border-emerald-200";
  if (k === "primeiraRega") return "bg-sky-50 border-sky-200";
  return "bg-zinc-50 border-zinc-200";
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

      // dentro do grupo: mais atrasada primeiro (deltaDays mais negativo)
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

      // reload events
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

  function summaryButton(
    key: "all" | StatusKey,
    title: string,
    count: number,
    emoji: string
  ) {
    const active = statusFilter === key;
    return (
      <button
        onClick={() => setStatusFilter(key)}
        className={[
          "rounded-2xl border p-3 text-left transition",
          active ? "bg-black text-white border-black" : "bg-white hover:bg-zinc-50",
        ].join(" ")}
        title={`Filtrar: ${title}`}
      >
        <div className={active ? "opacity-90 text-xs" : "opacity-70 text-xs"}>{emoji} {title}</div>
        <div className="text-lg font-semibold">{count}</div>
      </button>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-4">
      {/* Topo estilo app */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">🌱 Dashboard</h1>
          <p className="text-sm opacity-80 mt-1 truncate">
            Casa: <b>{house?.name ?? "..."}</b>
          </p>
          <p className="text-xs opacity-70 mt-1">
            Eventos = fonte da verdade • Ordenação por prioridade
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={loadAll} className="text-sm underline">
            Recarregar
          </button>
          <button onClick={logout} className="text-sm underline">
            Sair
          </button>
        </div>
      </div>

      {err && (
        <div className="mt-4 rounded-xl border p-3 text-sm bg-white">
          <b>Erro:</b> {err}
        </div>
      )}

      {/* Resumo + filtro por status */}
      <section className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-6">
        {summaryButton("all", "Todas", summaryAll.total, "📌")}
        {summaryButton("atrasada", "Atrasadas", summaryAll.atrasada, "🔴")}
        {summaryButton("hoje", "Hoje", summaryAll.hoje, "🟡")}
        {summaryButton("emDia", "Em dia", summaryAll.emDia, "🟢")}
        {summaryButton("primeiraRega", "1ª rega", summaryAll.primeira, "🔵")}
        {summaryButton("semFrequencia", "Sem freq.", summaryAll.semFreq, "⚪")}
      </section>

      {/* Ações globais */}
      <section className="mt-4 rounded-2xl border p-4 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Ações em lote</h2>
            <p className="text-xs opacity-80 mt-1">
              Selecione plantas e registre um evento (rega ou sol) de uma vez.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {!batchActive ? (
              <>
                <button
                  onClick={() => enterMode("waterBatch")}
                  className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50"
                >
                  💧 Regar Agora
                </button>
                <button
                  onClick={() => enterMode("sunBatch")}
                  className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50"
                >
                  ☀️ Sol Agora
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={confirmBatch}
                  disabled={savingBatch}
                  className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-60"
                >
                  {savingBatch ? "Salvando..." : "✅ Confirmar"}
                </button>
                <button
                  onClick={cancelBatch}
                  disabled={savingBatch}
                  className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-60"
                >
                  ❌ Cancelar
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mt-3">
          <label className="block text-xs font-medium">Buscar (nome ou ambiente)</label>
          <input
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ex: varanda, jiboia..."
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs opacity-80">
          <div>
            Exibindo <b>{filteredCards.length}</b> de <b>{summaryAll.total}</b>.
            {batchActive && (
              <>
                {" "}
                • Modo: <b>{mode === "waterBatch" ? "REGAR" : "SOL"}</b>
                {" "}
                • Selecionadas: <b>{selectedIds.length}</b>
              </>
            )}
          </div>

          {batchActive && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={selectAllVisible}
                className="rounded-xl border px-3 py-2 text-xs hover:bg-zinc-50"
                title="Selecionar todas as plantas que estão sendo exibidas"
              >
                Selecionar todas (visíveis)
              </button>
              <button
                onClick={clearSelection}
                className="rounded-xl border px-3 py-2 text-xs hover:bg-zinc-50"
                title="Limpar seleção"
              >
                Limpar
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Lista de cards */}
      <section className="mt-4">
        {loading && <p className="text-sm">Carregando...</p>}

        {!loading && filteredCards.length === 0 && (
          <div className="rounded-2xl border p-4 text-sm bg-white">
            Nenhuma planta encontrada com os filtros atuais.
          </div>
        )}

        <div className="space-y-3">
          {filteredCards.map((c) => {
            const p = c.plant;

            const lastLine = c.lastWaterDateIso
              ? `💧 Última rega: ${formatIsoToBrDate(c.lastWaterDateIso)}${
                  c.lastWaterTime ? ` às ${String(c.lastWaterTime).slice(0, 5)}` : ""
                }`
              : "💧 Última rega: —";

            const checked = Boolean(selected[p.id]);

            return (
              <div
                key={p.id}
                className="rounded-2xl border bg-white p-4"
                onClick={() => {
                  // no modo lote, tocar no card também seleciona (mais fácil no celular)
                  if (batchActive) toggleSelect(p.id);
                }}
                style={{ cursor: batchActive ? "pointer" : "default" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-3">
                      {batchActive && (
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelect(p.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 h-5 w-5"
                          aria-label={`Selecionar ${p.name}`}
                        />
                      )}

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold truncate">{p.name}</p>

                          <span
                            className={[
                              "inline-flex items-center gap-2 rounded-full border px-2 py-1 text-xs",
                              statusPillClass(c.status.key),
                            ].join(" ")}
                            title="Status"
                          >
                            <span>{c.status.emoji}</span>
                            <b>{c.status.label}</b>
                          </span>

                          {c.freq ? (
                            <span className="text-xs opacity-70">💧 {c.freq}d</span>
                          ) : (
                            <span className="text-xs opacity-60">💧 —</span>
                          )}
                        </div>

                        <p className="text-xs opacity-80 mt-2">🗓️ {c.nextText}</p>
                        <p className="text-xs opacity-80 mt-1">{lastLine}</p>
                        <p className="text-xs opacity-80 mt-1">
                          📍 {c.placeLabel ?? "(sem ambiente)"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    {!batchActive && (
                      <Link className="text-xs underline opacity-80" href={`/planta/${p.id}`}>
                        Ver detalhes
                      </Link>
                    )}
                  </div>
                </div>

                {!batchActive && (
                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-xs opacity-60">
                      Toque em “Regar Agora / Sol Agora” para selecionar em lote
                    </div>
                    <Link className="text-xs underline opacity-80" href={`/planta/${p.id}`}>
                      Abrir →
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Atalhos */}
      <footer className="mt-6 flex flex-wrap gap-3 text-sm">
        <Link className="underline" href="/plants">
          Cadastro (lista simples)
        </Link>
        <Link className="underline" href="/house">
          Casa
        </Link>
      </footer>
    </main>
  );
}