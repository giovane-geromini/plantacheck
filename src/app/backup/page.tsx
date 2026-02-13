"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

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

const STORAGE_KEY = "plantacheck:v4:plants";

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

function downloadFile(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadJson(filename: string, data: unknown) {
  downloadFile(filename, JSON.stringify(data, null, 2), "application/json;charset=utf-8");
}

function escapeCsv(value: unknown) {
  const s = String(value ?? "");
  // Excel pt-BR costuma preferir ; como separador
  // se tiver ; " ou quebra de linha -> coloca em aspas e escapa aspas
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatIsoToBr(dateIso?: string) {
  if (!dateIso) return "";
  const [y, m, d] = dateIso.split("-");
  return `${d}/${m}/${y}`;
}

function plantsToCsv(plants: Plant[]) {
  // Uma linha por rega (histórico completo).
  // Se não tiver regas, cria 1 linha com colunas de rega vazias.
  const header = [
    "planta_id",
    "planta_nome",
    "local",
    "frequencia_dias",
    "ultima_rega_data",
    "ultima_rega_hora",
    "rega_data",
    "rega_hora",
  ];

  const rows: string[][] = [];

  for (const p of plants) {
    const base: string[] = [
      String(p.id ?? ""),
      String(p.name ?? ""),
      String(p.place ?? ""),
      p.frequencyDays !== undefined && Number.isFinite(p.frequencyDays) ? String(p.frequencyDays) : "",
      formatIsoToBr(p.lastWateredDateIso),
      String(p.lastWateredTime ?? ""),
    ];

    if (!p.waterings || p.waterings.length === 0) {
      rows.push([...base, "", ""]);
      continue;
    }

    for (const w of p.waterings) {
      rows.push([...base, formatIsoToBr(w.dateIso), String(w.time ?? "")]);
    }
  }

  const csvLines = [
    header.map(escapeCsv).join(";"),
    ...rows.map((r) => r.map(escapeCsv).join(";")),
  ];

  return csvLines.join("\r\n");
}

export default function BackupPage() {
  const [plantsCount, setPlantsCount] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const plants = loadPlants();
    setPlantsCount(plants.length);
  }, []);

  function exportBackup() {
    setMsg(null);
    const plants = loadPlants();
    const fileName = `plantacheck-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const payload = { app: "PlantaCheck", version: 4, exportedAtIso: new Date().toISOString(), plants };
    downloadJson(fileName, payload);
    setMsg("Backup exportado com sucesso.");
  }

  function triggerImport() {
    setMsg(null);
    fileInputRef.current?.click();
  }

  async function handleImportFile(file: File) {
    setMsg(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as any;

      const importedPlants = Array.isArray(parsed) ? parsed : parsed?.plants;

      if (!Array.isArray(importedPlants)) {
        setMsg("Arquivo inválido: não encontrei a lista de plantas.");
        return;
      }

      const ok = window.confirm(
        `Importar backup com ${importedPlants.length} planta(s)? Isso vai substituir seus dados atuais.`
      );
      if (!ok) return;

      savePlants(importedPlants);
      setPlantsCount(importedPlants.length);
      setMsg("Backup importado com sucesso.");
    } catch {
      setMsg("Não foi possível importar: JSON inválido ou corrompido.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function exportExcelCsv() {
    setMsg(null);
    const plants = loadPlants();
    const csv = plantsToCsv(plants);
    const fileName = `plantacheck-export-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadFile(fileName, csv, "text/csv;charset=utf-8");
    setMsg("Exportação CSV gerada (abre no Excel).");
  }

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
        <Link
          href="/"
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #ccc",
            background: "#f7f7f7",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          🏠 Página Inicial
        </Link>
      </div>

      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Backup e exportações</h1>
        <p style={{ marginTop: 8, color: "#555" }}>
          Total de plantas atuais: <strong>{plantsCount}</strong>
        </p>
      </header>

      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, background: "white" }}>
        <h2 style={{ marginTop: 0 }}>Backup (JSON)</h2>
        <p style={{ marginTop: 6, color: "#555", fontSize: 14 }}>
          Use para salvar/transferir seus dados entre dispositivos ou navegadores.
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={exportBackup}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ccc",
              cursor: "pointer",
              background: "#f7f7f7",
            }}
          >
            ⬇️ Exportar backup (.json)
          </button>

          <button
            onClick={triggerImport}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ccc",
              cursor: "pointer",
              background: "#fff",
            }}
          >
            ⬆️ Importar backup (.json)
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
            }}
          />
        </div>
      </section>

      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, background: "white", marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Exportar para Excel</h2>
        <p style={{ marginTop: 6, color: "#555", fontSize: 14 }}>
          Gera um arquivo <strong>.csv</strong> (abre no Excel) com todas as plantas e o histórico completo de regas.
        </p>

        <button
          onClick={exportExcelCsv}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #ccc",
            cursor: "pointer",
            background: "#f7f7f7",
          }}
        >
          📊 Exportar Excel (CSV)
        </button>
      </section>

      {msg && (
        <div
          style={{
            marginTop: 14,
            color: msg.includes("inválido") || msg.includes("Não foi possível") ? "crimson" : "#2e7d32",
          }}
        >
          {msg}
        </div>
      )}

      <footer style={{ marginTop: 22, color: "#777", fontSize: 13 }}>
        Dica: no Excel, você pode “Salvar como” para .xlsx depois.
      </footer>
    </main>
  );
}
