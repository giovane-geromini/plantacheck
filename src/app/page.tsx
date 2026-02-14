"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import InstallPwaButton from "@/components/InstallPwaButton";

type Watering = { dateIso: string; time: string };

type Plant = {
  id: string;
  household_id: string;
  name: string;
  place?: string | null;
  last_watered_date_iso?: string | null;
  last_watered_time?: string | null;
  waterings: Watering[];
  frequency_days?: number | null;
};

type Household = {
  id: string;
  name: string;
  invite_code: string | null;
  created_by: string | null;
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

// ===== Próxima rega / status =====
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
  if (!p.frequency_days || p.frequency_days <= 0) {
    return { kind: "noFrequency", text: "Frequência: —" };
  }
  if (!p.last_watered_date_iso) {
    return {
      kind: "noLast",
      text: `Frequência: a cada ${p.frequency_days} dia(s) • Próxima: —`,
    };
  }

  const nextIso = addDaysToIso(p.last_watered_date_iso, p.frequency_days);
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

type StatusKey = "semRega" | "emDia" | "atencao" | "urgente";
type StatusInfo = { key: StatusKey; label: string; emoji: string };

function statusForPlant(p: Plant): StatusInfo {
  if (!p.last_watered_date_iso)
    return { key: "semRega", label: "Sem registro", emoji: "⚪" };

  if (p.frequency_days && p.frequency_days > 0) {
    const next = getNextWaterInfo(p);
    if (next.kind === "ok") {
      if (next.isOverdue) return { key: "urgente", label: "Atrasada", emoji: "🔴" };
      if (next.isToday) return { key: "atencao", label: "Hoje", emoji: "🟡" };
      return { key: "emDia", label: "Em dia", emoji: "🟢" };
    }
  }

  const todayIso = todayIsoBrasilia();
  const days = diffDaysIso(p.last_watered_date_iso, todayIso);
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
  if (!p.last_watered_date_iso) return 10_000;

  const next = getNextWaterInfo(p);
  if (next.kind === "ok") {
    if (next.deltaDays < 0) return 5_000 + Math.abs(next.deltaDays);
    if (next.deltaDays === 0) return 2_500;
    return 100 - next.deltaDays;
  }

  const todayIso = todayIsoBrasilia();
  return diffDaysIso(p.last_watered_date_iso, todayIso);
}

function compareBySort(a: Plant, b: Plant, sort: SortKey) {
  if (sort === "urgentePrimeiro") {
    const sa = urgencyScore(a);
    const sb = urgencyScore(b);
    if (sb !== sa) return sb - sa;
    return a.name.localeCompare(b.name, "pt-BR");
  }

  if (sort === "recentesPrimeiro") {
    const aHas = Boolean(a.last_watered_date_iso);
    const bHas = Boolean(b.last_watered_date_iso);
    if (aHas !== bHas) return aHas ? -1 : 1;

    if (!a.last_watered_date_iso || !b.last_watered_date_iso)
      return a.name.localeCompare(b.name, "pt-BR");

    const todayIso = todayIsoBrasilia();
    const da = diffDaysIso(a.last_watered_date_iso, todayIso);
    const db = diffDaysIso(b.last_watered_date_iso, todayIso);
    if (da !== db) return da - db;
    return a.name.localeCompare(b.name, "pt-BR");
  }

  return a.name.localeCompare(b.name, "pt-BR");
}

// ===== Helpers =====
function makeInviteCode(len = 7) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export default function HomePage() {
  // Auth
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Login UI
  const [email, setEmail] = useState("");
  const [authMsg, setAuthMsg] = useState<string | null>(null);
  const [authErr, setAuthErr] = useState<string | null>(null);

  // Household
  const [household, setHousehold] = useState<Household | null>(null);
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [houseErr, setHouseErr] = useState<string | null>(null);

  // Plants
  const [plants, setPlants] = useState<Plant[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // UI Filters
  const [name, setName] = useState("");
  const [place, setPlace] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPlace, setEditPlace] = useState("");

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | StatusKey>("all");
  const [sortBy, setSortBy] = useState<SortKey>("urgentePrimeiro");

  // Realtime subscription ref
  const rtRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // 1) Boot auth
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id ?? null;
      if (!mounted) return;
      setUserId(uid);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // 2) Load household after login
  useEffect(() => {
    if (!userId) {
      setHousehold(null);
      setPlants([]);
      setHydrated(false);
      if (rtRef.current) {
        supabase.removeChannel(rtRef.current);
        rtRef.current = null;
      }
      return;
    }

    (async () => {
      setHouseErr(null);

      // pegar household do usuário via household_members
      const { data: hm, error: hmErr } = await supabase
        .from("household_members")
        .select("household_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (hmErr) {
        setHouseErr(hmErr.message);
        setHousehold(null);
        return;
      }

      // se não tem lar ainda, cria automaticamente
      if (!hm?.household_id) {
        const invite = makeInviteCode();

        const { data: h, error: hErr } = await supabase
          .from("households")
          .insert({ name: "Casa PlantaCheck", invite_code: invite, created_by: userId })
          .select("*")
          .single();

        if (hErr) {
          setHouseErr(hErr.message);
          setHousehold(null);
          return;
        }

        const { error: mErr } = await supabase
          .from("household_members")
          .insert({ household_id: h.id, user_id: userId, role: "owner" });

        if (mErr) {
          setHouseErr(mErr.message);
          setHousehold(null);
          return;
        }

        setHousehold(h as Household);
        return;
      }

      // se já tem, carrega
      const { data: h2, error: h2Err } = await supabase
        .from("households")
        .select("*")
        .eq("id", hm.household_id)
        .single();

      if (h2Err) {
        setHouseErr(h2Err.message);
        setHousehold(null);
        return;
      }

      setHousehold(h2 as Household);
    })();
  }, [userId]);

  // 3) Load plants + realtime once household is ready
  useEffect(() => {
    if (!userId || !household?.id) return;

    let cancelled = false;

    (async () => {
      setHydrated(false);

      const { data, error } = await supabase
        .from("plants")
        .select("*")
        .eq("household_id", household.id)
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        setHouseErr(error.message);
        setPlants([]);
        setHydrated(true);
        return;
      }

      setPlants((data as any as Plant[]) ?? []);
      setHydrated(true);
    })();

    // realtime: re-subscrever para este household
    if (rtRef.current) {
      supabase.removeChannel(rtRef.current);
      rtRef.current = null;
    }

    const ch = supabase
      .channel(`plants:${household.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "plants", filter: `household_id=eq.${household.id}` },
        (payload) => {
          // aplica patch local
          setPlants((prev) => {
            const ev = payload.eventType;
            if (ev === "INSERT") {
              const row = payload.new as any as Plant;
              // evita duplicar
              if (prev.some((p) => p.id === row.id)) return prev;
              return [row, ...prev];
            }
            if (ev === "UPDATE") {
              const row = payload.new as any as Plant;
              return prev.map((p) => (p.id === row.id ? row : p));
            }
            if (ev === "DELETE") {
              const oldRow = payload.old as any as { id: string };
              return prev.filter((p) => p.id !== oldRow.id);
            }
            return prev;
          });
        }
      )
      .subscribe();

    rtRef.current = ch;

    return () => {
      cancelled = true;
      if (rtRef.current) {
        supabase.removeChannel(rtRef.current);
        rtRef.current = null;
      }
    };
  }, [userId, household?.id]);

  // ===== Actions =====
  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setAuthErr(null);
    setAuthMsg(null);

    const trimmed = email.trim();
    if (!trimmed) {
      setAuthErr("Informe seu e-mail.");
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
      },
    });

    if (error) setAuthErr(error.message);
    else setAuthMsg("Link enviado! Confira seu e-mail para entrar.");
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  async function joinByInvite() {
    setHouseErr(null);
    const code = inviteCodeInput.trim().toUpperCase();
    if (!code) {
      setHouseErr("Informe o código de convite.");
      return;
    }
    if (!userId) return;

    const { data: h, error: hErr } = await supabase
      .from("households")
      .select("*")
      .eq("invite_code", code)
      .single();

    if (hErr) {
      setHouseErr("Código inválido (ou lar não encontrado).");
      return;
    }

    // cria membership
    const { error: mErr } = await supabase
      .from("household_members")
      .insert({ household_id: (h as any).id, user_id: userId, role: "member" });

    if (mErr) {
      // se já existe, ok
      if (!String(mErr.message).toLowerCase().includes("duplicate")) {
        setHouseErr(mErr.message);
        return;
      }
    }

    setHousehold(h as any as Household);
    setInviteCodeInput("");
  }

  async function addPlant(e: React.FormEvent) {
    e.preventDefault();
    if (!household?.id) return;

    const trimmedName = name.trim();
    const trimmedPlace = place.trim();

    if (!trimmedName) {
      setFormError("Informe o nome da planta.");
      return;
    }
    setFormError(null);

    const { error } = await supabase.from("plants").insert({
      household_id: household.id,
      name: trimmedName,
      place: trimmedPlace ? trimmedPlace : null,
      waterings: [],
      frequency_days: null,
      last_watered_date_iso: null,
      last_watered_time: null,
    });

    if (error) {
      setFormError(error.message);
      return;
    }

    setName("");
    setPlace("");
  }

  async function waterNow(plantId: string) {
    const { dateIso, timeBr } = nowInBrasiliaParts();
    const plant = plants.find((p) => p.id === plantId);
    if (!plant) return;

    const nextWaterings = [{ dateIso, time: timeBr }, ...(plant.waterings ?? [])];

    // otimista
    setPlants((prev) =>
      prev.map((p) =>
        p.id === plantId
          ? { ...p, last_watered_date_iso: dateIso, last_watered_time: timeBr, waterings: nextWaterings }
          : p
      )
    );

    const { error } = await supabase
      .from("plants")
      .update({
        last_watered_date_iso: dateIso,
        last_watered_time: timeBr,
        waterings: nextWaterings,
      })
      .eq("id", plantId);

    if (error) {
      // rollback simples: recarrega lista
      const { data } = await supabase
        .from("plants")
        .select("*")
        .eq("household_id", household?.id ?? "")
        .order("created_at", { ascending: false });
      setPlants((data as any as Plant[]) ?? []);
    }
  }

  async function removePlant(plantId: string) {
    const plant = plants.find((p) => p.id === plantId);
    const ok = window.confirm(`Remover "${plant?.name ?? "esta planta"}"?`);
    if (!ok) return;

    // otimista
    setPlants((prev) => prev.filter((p) => p.id !== plantId));

    const { error } = await supabase.from("plants").delete().eq("id", plantId);
    if (error) {
      // se falhar, recarrega
      const { data } = await supabase
        .from("plants")
        .select("*")
        .eq("household_id", household?.id ?? "")
        .order("created_at", { ascending: false });
      setPlants((data as any as Plant[]) ?? []);
    }

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
  async function saveEditPlace(plantId: string) {
    const trimmed = editPlace.trim();

    // otimista
    setPlants((prev) => prev.map((p) => (p.id === plantId ? { ...p, place: trimmed ? trimmed : null } : p)));

    setEditingId(null);
    setEditPlace("");

    const { error } = await supabase
      .from("plants")
      .update({ place: trimmed ? trimmed : null })
      .eq("id", plantId);

    if (error) {
      const { data } = await supabase
        .from("plants")
        .select("*")
        .eq("household_id", household?.id ?? "")
        .order("created_at", { ascending: false });
      setPlants((data as any as Plant[]) ?? []);
    }
  }

  // ===== UI helpers =====
  const counts = useMemo(() => {
    let first = 0;
    let today = 0;
    let overdue = 0;

    for (const p of plants) {
      const hasFreq = Boolean(p.frequency_days && p.frequency_days > 0);
      const hasLast = Boolean(p.last_watered_date_iso);

      if (hasFreq && !hasLast) first += 1;

      const next = getNextWaterInfo(p);
      if (next.kind !== "ok") continue;
      if (next.isToday) today += 1;
      if (next.isOverdue) overdue += 1;
    }

    return { first, today, overdue };
  }, [plants]);

  const visiblePlants = useMemo(() => {
    const q = query.trim().toLowerCase();

    const filtered = plants.filter((p) => {
      const st = statusForPlant(p);

      const matchesQuery =
        !q || p.name.toLowerCase().includes(q) || (p.place ?? "").toLowerCase().includes(q);

      const matchesStatus = statusFilter === "all" ? true : st.key === statusFilter;

      return matchesQuery && matchesStatus;
    });

    return filtered.sort((a, b) => compareBySort(a, b, sortBy));
  }, [plants, query, statusFilter, sortBy]);

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

  // ===== Screens =====
  if (loading) {
    return (
      <main style={{ padding: 24, fontFamily: "Arial, sans-serif" }}>
        <p>Carregando...</p>
      </main>
    );
  }

  // Not logged
  if (!userId) {
    return (
      <>
        <main style={{ padding: 24, fontFamily: "Arial, sans-serif", maxWidth: 640, margin: "0 auto" }}>
          <h1 style={{ marginTop: 0 }}>🌱 PlantaCheck</h1>
          <p style={{ color: "#444" }}>Entre com seu e-mail para acessar suas plantas sincronizadas.</p>

          <form onSubmit={sendMagicLink} style={{ display: "grid", gap: 10, marginTop: 14 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span>E-mail</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seuemail@exemplo.com"
                style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
              />
            </label>

            {authErr && <div style={{ color: "crimson", fontSize: 14 }}>{authErr}</div>}
            {authMsg && <div style={{ color: "green", fontSize: 14 }}>{authMsg}</div>}

            <button
              type="submit"
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #ccc",
                cursor: "pointer",
                background: "#2E7D32",
                color: "white",
                fontWeight: 700,
                width: "fit-content",
              }}
            >
              Enviar link de acesso
            </button>
          </form>

          <p style={{ marginTop: 18, fontSize: 13, color: "#666" }}>
            Dica: depois de entrar, instale o app pelo botão “Instalar App”.
          </p>
        </main>

        <InstallPwaButton />
      </>
    );
  }

  // Logged, but household error
  if (houseErr) {
    return (
      <main style={{ padding: 24, fontFamily: "Arial, sans-serif", maxWidth: 800, margin: "0 auto" }}>
        <h1 style={{ marginTop: 0 }}>🌱 PlantaCheck</h1>
        <p style={{ color: "crimson" }}><strong>Erro:</strong> {houseErr}</p>
        <button
          onClick={logout}
          style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ccc", cursor: "pointer" }}
        >
          Sair
        </button>
      </main>
    );
  }

  // Logged, household ok
  return (
    <>
      <main style={{ padding: "clamp(16px, 3vw, 32px)", fontFamily: "Arial, sans-serif", maxWidth: 1400, margin: "0 auto" }}>
        <header style={{ marginBottom: "1.2rem", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
          <div>
            <h1 style={{ margin: 0 }}>🌱 PlantaCheck</h1>
            <p style={{ marginTop: 8, color: "#444" }}>
              Sincronizado no lar: <strong>{household?.name ?? "—"}</strong>
            </p>
            <p style={{ marginTop: 6, color: "#666", fontSize: 13 }}>
              Convite da casa: <strong>{household?.invite_code ?? "—"}</strong> (envie para sua namorada entrar no mesmo lar)
            </p>
          </div>

          <button
            onClick={logout}
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ccc", cursor: "pointer", background: "#fff", height: 42 }}
            title="Sair"
          >
            Sair
          </button>
        </header>

        {/* Entrar por convite (caso você queira entrar em outra casa) */}
        <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, background: "white", marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Entrar em um lar pelo convite (opcional)</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Código</span>
              <input
                value={inviteCodeInput}
                onChange={(e) => setInviteCodeInput(e.target.value)}
                placeholder="EX: A1B2C3D"
                style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc", minWidth: 220, textTransform: "uppercase" }}
              />
            </label>
            <button
              onClick={joinByInvite}
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ccc", cursor: "pointer", background: "#f7f7f7", height: 42 }}
            >
              Entrar
            </button>
          </div>
        </section>

        {!hydrated ? (
          <p>Carregando plantas...</p>
        ) : (
          <>
            {/* Adicionar */}
            <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, background: "white", marginBottom: 16 }}>
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

            {/* Filtros */}
            <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, background: "white", marginBottom: 16 }}>
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

                    const lastLine = p.last_watered_date_iso
                      ? `💧 Última rega: ${formatIsoToBrDate(p.last_watered_date_iso)} às ${p.last_watered_time ?? "—"}`
                      : "💧 Última rega: —";

                    const nextInfo = getNextWaterInfo(p);

                    return (
                      <li key={p.id} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 0, background: "white", overflow: "hidden" }}>
                        <Link
                          href={`/planta/${p.id}`}
                          style={{ display: "block", padding: 16, color: "inherit", textDecoration: "none" }}
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

                        <div style={{ borderTop: "1px solid #eee", padding: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                          <button
                            onClick={() => waterNow(p.id)}
                            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ccc", cursor: "pointer", background: "#f7f7f7" }}
                          >
                            Reguei agora
                          </button>

                          {editingId !== p.id ? (
                            <button
                              onClick={() => startEditPlace(p.id)}
                              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ccc", cursor: "pointer", background: "#fff" }}
                            >
                              ✏️ Editar local
                            </button>
                          ) : (
                            <>
                              <input
                                value={editPlace}
                                onChange={(e) => setEditPlace(e.target.value)}
                                placeholder="Ex.: Sala, Varanda..."
                                style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc", minWidth: 220 }}
                              />
                              <button
                                onClick={() => saveEditPlace(p.id)}
                                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ccc", cursor: "pointer", background: "#f7f7f7" }}
                              >
                                ✅ Salvar
                              </button>
                              <button
                                onClick={cancelEditPlace}
                                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ccc", cursor: "pointer", background: "#fff" }}
                              >
                                ❌ Cancelar
                              </button>
                            </>
                          )}

                          <button
                            onClick={() => removePlant(p.id)}
                            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ccc", cursor: "pointer", background: "#fff", marginLeft: "auto" }}
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

            <footer style={{ marginTop: 28, paddingTop: 14, borderTop: "1px solid #eee", color: "#666", fontSize: 13 }}>
              <Link href="/backup" style={{ color: "inherit", textDecoration: "underline" }}>
                Backup e exportações
              </Link>
            </footer>
          </>
        )}
      </main>

      <InstallPwaButton />
    </>
  );
}
