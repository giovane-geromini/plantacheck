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
type StatusInfo = { key: StatusKey; label: string; emoji: string; pill: string };

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
      status: {
        key: "semFrequencia",
        label: "Sem frequência",
        emoji: "⚪",
        pill: "bg-zinc-100 text-zinc-700 border-zinc-200",
      },
      nextText: "Frequência: —",
      nextDateIso: null,
      deltaDays: null,
    };
  }

  if (!lastWaterDateIso) {
    return {
      status: {
        key: "primeiraRega",
        label: "Primeira rega",
        emoji: "🔵",
        pill: "bg-blue-50 text-blue-700 border-blue-200",
      },
      nextText: `Frequência: a cada ${frequencyDays} dia(s) • Próxima: —`,
      nextDateIso: null,
      deltaDays: null,
    };
  }

  const nextIso = addDaysToIso(lastWaterDateIso, frequencyDays);
  const delta = diffDaysIso(todayIso, nextIso); // next - today

  if (delta < 0) {
    return {
      status: {
        key: "atrasada",
        label: "Atrasada",
        emoji: "🔴",
        pill: "bg-red-50 text-red-700 border-red-200",
      },
      nextText: `Próxima: ${formatIsoToBrDate(nextIso)} • Atrasada há ${Math.abs(delta)} dia(s)`,
      nextDateIso: nextIso,
      deltaDays: delta,
    };
  }

  if (delta === 0) {
    return {
      status: {
        key: "hoje",
        label: "Hoje",
        emoji: "🟡",
        pill: "bg-amber-50 text-amber-800 border-amber-200",
      },
      nextText: `Próxima: ${formatIsoToBrDate(nextIso)} • Hoje`,
      nextDateIso: nextIso,
      deltaDays: delta,
    };
  }

  return {
    status: {
      key: "emDia",
      label: "Em dia",
      emoji: "🟢",
      pill: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
    nextText: `Próxima: ${formatIsoToBrDate(nextIso)} • Faltam ${delta} dia(s)`,
    nextDateIso: nextIso,
    deltaDays: delta,
  };
}

type Mode = "idle" | "waterBatch" | "sunBatch";

export default function DashboardPage() {
  const router = useRouter();

  // ===== Auth gate =====
  const [authChecked, setAuthChecked] = useState(false);
  const [authStatus, setAuthStatus] = useState("Verificando login...");
  const [userEmail, setUserEmail] = useState<string | null>(null);

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

  // Gate principal: sessão + password_set
  useEffect(() => {
    let cancelled = false;

    const safeSet = (fn: () => void) => {
      if (!cancelled) fn();
    };

    const checkGate = async () => {
      safeSet(() => {
        setAuthChecked(false);
        setAuthStatus("Verificando sessão...");
      });

      const { data, error } = await supabaseBrowser.auth.getSession();
      if (error) {
        router.replace("/login");
        return;
      }

      const session = data.session;
      if (!session?.user) {
        router.replace("/login");
        return;
      }

      const user = session.user;
      safeSet(() => setUserEmail(user.email ?? null));

      safeSet(() => setAuthStatus("Checando segurança..."));
      const { data: sec, error: secErr } = await supabaseBrowser
        .from("user_security")
        .select("password_set")
        .eq("user_id", user.id)
        .maybeSingle();

      if (secErr) {
        console.error("Erro ao checar user_security:", secErr.message);
        router.replace("/login");
        return;
      }

      if (!sec?.password_set) {
        router.replace("/set-password");
        return;
      }

      safeSet(() => {
        setAuthChecked(true);
        setAuthStatus("OK");
      });
    };

    checkGate();

    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        router.replace("/login");
        return;
      }
      checkGate();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [router]);

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
    if (!authChecked) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked]);

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

  const cards = useMemo(() => {
    const q = query.trim().toLowerCase();

    const out = plants.map((p) => {
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

      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (placeLabel ?? "").toLowerCase().includes(q);

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
        matchesQuery,
      };
    });

    const priority = (k: StatusKey) => {
      if (k === "atrasada") return 0;
      if (k === "hoje") return 1;
      if (k === "emDia") return 2;
      if (k === "primeiraRega") return 3;
      return 4;
    };

    return out
      .filter((c) => c.matchesQuery)
      .sort((a, b) => {
        const pa = priority(a.status.key);
        const pb = priority(b.status.key);
        if (pa !== pb) return pa - pb;

        if (a.deltaDays != null && b.deltaDays != null && a.deltaDays !== b.deltaDays) {
          return a.deltaDays - b.deltaDays;
        }

        return a.plant.name.localeCompare(b.plant.name, "pt-BR");
      });
  }, [plants, placeNameById, lastEventByPlantAndType, query, todayIso]);

  const summary = useMemo(() => {
    let atrasada = 0;
    let hoje = 0;
    let emDia = 0;
    let primeira = 0;
    let semFreq = 0;

    for (const c of cards) {
      if (c.status.key === "atrasada") atrasada++;
      else if (c.status.key === "hoje") hoje++;
      else if (c.status.key === "emDia") emDia++;
      else if (c.status.key === "primeiraRega") primeira++;
      else semFreq++;
    }

    return { atrasada, hoje, emDia, primeira, semFreq, total: cards.length };
  }, [cards]);

  function toggleSelect(id: string) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }

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

  async function confirmBatch() {
    if (!house) return;

    const ids = Object.entries(selected)
      .filter(([, v]) => v)
      .map(([k]) => k);

    if (ids.length === 0) {
      alert("Selecione ao menos 1 planta.");
      return;
    }

    const ok = window.confirm(
      `${mode === "waterBatch" ? "Registrar REGA" : "Registrar SOL"} para ${ids.length} planta(s)?`
    );
    if (!ok) return;

    setSavingBatch(true);
    setErr(null);

    try {
      const { data: userData } = await supabaseBrowser.auth.getUser();
      const userId = userData?.user?.id ?? null;

      const { dateIso, timeBr } = nowInBrasiliaParts();

      const payload = ids.map((plantId) => ({
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

  const batchActive = mode !== "idle";
  const selectedCount = useMemo(
    () => Object.values(selected).filter(Boolean).length,
    [selected]
  );

  // ===== Tela enquanto valida login (resolve seu RLS no celular) =====
  if (!authChecked) {
    return (
      <main className="min-h-dvh bg-zinc-50 p-4">
        <div className="mx-auto max-w-md rounded-2xl border bg-white p-4">
          <p className="text-sm">{authStatus}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-zinc-50 pb-24">
      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-md px-4 py-4 sm:max-w-2xl">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold leading-tight">🌱 Dashboard</h1>
              <p className="mt-1 text-xs text-zinc-600">
                Casa: <b className="text-zinc-900">{house?.name ?? "..."}</b>
                {userEmail ? (
                  <>
                    {" "}
                    • <span className="text-zinc-500">{userEmail}</span>
                  </>
                ) : null}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={loadAll} className="text-sm text-zinc-700 underline">
                Recarregar
              </button>
              <button onClick={logout} className="text-sm text-zinc-700 underline">
                Sair
              </button>
            </div>
          </div>

          {err && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <b>Erro:</b> {err}
            </div>
          )}

          {/* Busca */}
          <div className="mt-4">
            <label className="block text-xs font-medium text-zinc-700">
              Buscar (nome ou ambiente)
            </label>
            <input
              className="mt-1 w-full rounded-2xl border bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ex: varanda, jiboia..."
            />
          </div>

          {/* Resumo (chips) */}
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <div className="shrink-0 rounded-2xl border bg-white px-3 py-2 text-xs">
              <div className="text-zinc-500">Total</div>
              <div className="text-base font-semibold">{summary.total}</div>
            </div>
            <div className="shrink-0 rounded-2xl border bg-white px-3 py-2 text-xs">
              <div className="text-zinc-500">🔴 Atrasadas</div>
              <div className="text-base font-semibold">{summary.atrasada}</div>
            </div>
            <div className="shrink-0 rounded-2xl border bg-white px-3 py-2 text-xs">
              <div className="text-zinc-500">🟡 Hoje</div>
              <div className="text-base font-semibold">{summary.hoje}</div>
            </div>
            <div className="shrink-0 rounded-2xl border bg-white px-3 py-2 text-xs">
              <div className="text-zinc-500">🟢 Em dia</div>
              <div className="text-base font-semibold">{summary.emDia}</div>
            </div>
            <div className="shrink-0 rounded-2xl border bg-white px-3 py-2 text-xs">
              <div className="text-zinc-500">🔵 1ª rega</div>
              <div className="text-base font-semibold">{summary.primeira}</div>
            </div>
            <div className="shrink-0 rounded-2xl border bg-white px-3 py-2 text-xs">
              <div className="text-zinc-500">⚪ Sem freq.</div>
              <div className="text-base font-semibold">{summary.semFreq}</div>
            </div>
          </div>

          {/* Ações em lote */}
          <section className="mt-4 rounded-3xl border bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Ações em lote</h2>
                <p className="mt-1 text-xs text-zinc-600">
                  Selecione plantas e registre um evento de uma vez.
                </p>
              </div>
              {batchActive && (
                <div className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700">
                  Selecionadas: <b>{selectedCount}</b>
                </div>
              )}
            </div>

            {!batchActive ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => enterMode("waterBatch")}
                  className="rounded-2xl border bg-emerald-600 px-3 py-3 text-sm font-medium text-white"
                >
                  💧 Regar agora
                </button>
                <button
                  onClick={() => enterMode("sunBatch")}
                  className="rounded-2xl border bg-amber-500 px-3 py-3 text-sm font-medium text-white"
                >
                  ☀️ Sol agora
                </button>
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={confirmBatch}
                  disabled={savingBatch}
                  className="rounded-2xl border bg-zinc-900 px-3 py-3 text-sm font-medium text-white disabled:opacity-60"
                >
                  {savingBatch ? "Salvando..." : "✅ Confirmar"}
                </button>
                <button
                  onClick={cancelBatch}
                  disabled={savingBatch}
                  className="rounded-2xl border bg-white px-3 py-3 text-sm font-medium text-zinc-900 disabled:opacity-60"
                >
                  ❌ Cancelar
                </button>
              </div>
            )}

            <div className="mt-3 text-xs text-zinc-600">
              Exibindo <b>{cards.length}</b> planta(s).
              {batchActive ? (
                <>
                  {" "}
                  • Modo: <b>{mode === "waterBatch" ? "REGAR" : "SOL"}</b>
                </>
              ) : null}
            </div>
          </section>
        </div>
      </div>

      {/* Lista */}
      <section className="mx-auto max-w-md px-4 pt-4 sm:max-w-2xl">
        {loading && <p className="text-sm text-zinc-700">Carregando...</p>}

        {!loading && cards.length === 0 && (
          <div className="rounded-3xl border bg-white p-4 text-sm text-zinc-700">
            Nenhuma planta encontrada.
          </div>
        )}

        <div className="space-y-3">
          {cards.map((c) => {
            const p = c.plant;
            const checked = Boolean(selected[p.id]);

            const lastLine = c.lastWaterDateIso
              ? `Última rega: ${formatIsoToBrDate(c.lastWaterDateIso)}${
                  c.lastWaterTime ? ` às ${String(c.lastWaterTime).slice(0, 5)}` : ""
                }`
              : "Última rega: —";

            return (
              <div key={p.id} className="rounded-3xl border bg-white p-4">
                <div className="flex items-start gap-3">
                  {batchActive ? (
                    <button
                      onClick={() => toggleSelect(p.id)}
                      className={`mt-1 h-6 w-6 shrink-0 rounded-lg border ${
                        checked ? "bg-zinc-900 border-zinc-900" : "bg-white"
                      }`}
                      aria-label={`Selecionar ${p.name}`}
                      title="Selecionar"
                    />
                  ) : (
                    <div className="mt-1 h-6 w-6 shrink-0 rounded-lg bg-emerald-50" />
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-base font-semibold">{p.name}</p>

                      <span
                        className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${c.status.pill}`}
                        title={c.status.label}
                      >
                        {c.status.emoji} {c.status.label}
                      </span>
                    </div>

                    <p className="mt-2 text-xs text-zinc-600">🗓️ {c.nextText}</p>
                    <p className="mt-1 text-xs text-zinc-600">💧 {lastLine}</p>

                    <p className="mt-2 text-xs text-zinc-600">
                      📍 {c.placeLabel ?? "(sem ambiente)"}{" "}
                      {c.freq ? `• 💧 ${c.freq}d` : ""}
                    </p>

                    <div className="mt-3 flex items-center justify-between">
                      <Link
                        className="text-sm font-medium text-emerald-700 underline"
                        href={`/planta/${p.id}`}
                      >
                        Ver detalhes
                      </Link>

                      {batchActive ? (
                        <button
                          onClick={() => toggleSelect(p.id)}
                          className="rounded-2xl border px-3 py-2 text-xs"
                        >
                          {checked ? "Remover" : "Selecionar"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Bottom nav (cara de app) */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t bg-white/90 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-3 px-2 py-2 sm:max-w-2xl">
          <Link
            href="/dashboard"
            className="flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-xs"
          >
            <span className="text-lg">🏠</span>
            <span className="text-zinc-800">Dashboard</span>
          </Link>
          <Link
            href="/plants"
            className="flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-xs"
          >
            <span className="text-lg">🌿</span>
            <span className="text-zinc-800">Plantas</span>
          </Link>
          <Link
            href="/house"
            className="flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-xs"
          >
            <span className="text-lg">🏡</span>
            <span className="text-zinc-800">Casa</span>
          </Link>
        </div>
      </nav>
    </main>
  );
}