"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Watering = { dateIso: string; time: string };

type Plant = {
  id: string;
  name: string;
  place?: string;
  lastWateredDateIso?: string;
  lastWateredTime?: string;
  waterings: Watering[];
  frequencyDays?: number;
};

type PlantRow = {
  id: string;
  household_id: string;
  name: string;
  place: string | null;
  last_watered_date_iso: string | null;
  last_watered_time: string | null;
  frequency_days: number | null;
  waterings: any;
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

  return { timeBr: `${timeParts.hour}:${timeParts.minute}`, dateIso: `${dateParts.year}-${dateParts.month}-${dateParts.day}` };
}

function formatIsoToBrDate(dateIso: string) {
  const [y, m, d] = dateIso.split("-");
  return `${d}/${m}/${y}`;
}

function rowToPlant(r: PlantRow): Plant {
  return {
    id: r.id,
    name: r.name,
    place: r.place ?? undefined,
    lastWateredDateIso: r.last_watered_date_iso ?? undefined,
    lastWateredTime: r.last_watered_time ?? undefined,
    frequencyDays: r.frequency_days ?? undefined,
    waterings: Array.isArray(r.waterings) ? (r.waterings as Watering[]) : [],
  };
}

export default function PlantDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const plantId = params?.id;

  const [loading, setLoading] = useState(true);
  const [plant, setPlant] = useState<Plant | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [editName, setEditName] = useState("");
  const [editPlace, setEditPlace] = useState("");
  const [editFreq, setEditFreq] = useState<string>("");

  const freqNumber = useMemo(() => {
    const n = Number(editFreq);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  }, [editFreq]);

  useEffect(() => {
    (async () => {
      setErr(null);
      setLoading(true);

      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase.from("plants").select("*").eq("id", plantId).single();
      if (error) {
        setErr(error.message ?? "Erro ao carregar planta.");
        setLoading(false);
        return;
      }

      const p = rowToPlant(data as PlantRow);
      setPlant(p);
      setEditName(p.name);
      setEditPlace(p.place ?? "");
      setEditFreq(p.frequencyDays ? String(p.frequencyDays) : "");
      setLoading(false);
    })();
  }, [plantId, router]);

  async function saveBasics() {
    if (!plant) return;
    setErr(null);

    const name = editName.trim();
    if (!name) {
      setErr("Nome não pode ficar vazio.");
      return;
    }

    const place = editPlace.trim();
    const patch: any = {
      name,
      place: place ? place : null,
      frequency_days: freqNumber,
    };

    const { error } = await supabase.from("plants").update(patch).eq("id", plant.id);
    if (error) {
      setErr(error.message ?? "Erro ao salvar.");
      return;
    }

    setPlant({
      ...plant,
      name,
      place: place ? place : undefined,
      frequencyDays: freqNumber ?? undefined,
    });
  }

  async function waterNow() {
    if (!plant) return;
    const { dateIso, timeBr } = nowInBrasiliaParts();
    const newW: Watering = { dateIso, time: timeBr };
    const waterings = [newW, ...(plant.waterings ?? [])];

    const patch: any = {
      last_watered_date_iso: dateIso,
      last_watered_time: timeBr,
      waterings,
    };

    const { error } = await supabase.from("plants").update(patch).eq("id", plant.id);
    if (error) {
      setErr(error.message ?? "Erro ao salvar rega.");
      return;
    }

    setPlant({
      ...plant,
      lastWateredDateIso: dateIso,
      lastWateredTime: timeBr,
      waterings,
    });
  }

  return (
    <main style={{ padding: 20, fontFamily: "Arial, sans-serif", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: 14 }}>
        <Link href="/" style={{ textDecoration: "underline" }}>
          ← Voltar
        </Link>
      </div>

      {loading ? (
        <p>Carregando...</p>
      ) : err ? (
        <div style={{ color: "crimson" }}>{err}</div>
      ) : !plant ? (
        <p>Planta não encontrada.</p>
      ) : (
        <>
          <h1 style={{ marginTop: 0 }}>🌿 {plant.name}</h1>

          <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, background: "white", marginBottom: 14 }}>
            <h2 style={{ marginTop: 0 }}>Informações</h2>

            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span>Nome</span>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }} />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span>Local</span>
                <input value={editPlace} onChange={(e) => setEditPlace(e.target.value)} style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }} />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span>Frequência (dias)</span>
                <input
                  value={editFreq}
                  onChange={(e) => setEditFreq(e.target.value)}
                  inputMode="numeric"
                  placeholder="Ex.: 7"
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
                />
              </label>

              <button
                onClick={saveBasics}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  cursor: "pointer",
                  background: "#f7f7f7",
                  width: "fit-content",
                }}
              >
                ✅ Salvar
              </button>

              {err && <div style={{ color: "crimson" }}>{err}</div>}
            </div>
          </section>

          <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, background: "white", marginBottom: 14 }}>
            <h2 style={{ marginTop: 0 }}>Rega</h2>

            <div style={{ color: "#444" }}>
              <div>
                Última:{" "}
                <strong>
                  {plant.lastWateredDateIso ? `${formatIsoToBrDate(plant.lastWateredDateIso)} às ${plant.lastWateredTime ?? "—"}` : "—"}
                </strong>
              </div>
            </div>

            <button
              onClick={waterNow}
              style={{
                marginTop: 10,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #ccc",
                cursor: "pointer",
                background: "#2E7D32",
                color: "white",
                fontWeight: 700,
              }}
            >
              💧 Reguei agora
            </button>
          </section>

          <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, background: "white" }}>
            <h2 style={{ marginTop: 0 }}>Histórico</h2>

            {plant.waterings.length === 0 ? (
              <p>Nenhum registro ainda.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {plant.waterings.map((w, idx) => (
                  <li key={idx}>
                    {formatIsoToBrDate(w.dateIso)} às {w.time}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
