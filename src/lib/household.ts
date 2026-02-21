// src/lib/household.ts
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export type Household = {
  id: string;
  owner_user_id: string;
  name: string;
  invite_code: string;
  created_at: string;
  updated_at: string;
};

function getSupabaseClient(): any {
  return typeof supabaseBrowser === "function" ? (supabaseBrowser as any)() : (supabaseBrowser as any);
}

function makeInviteCode(len = 7) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export async function getOrCreateHousehold() {
  const supabase = getSupabaseClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) throw userErr;
  if (!user) throw new Error("Usuário não autenticado.");

  // 1) tenta buscar casa existente
  const { data: existing, error: selErr } = await supabase
    .from("households")
    .select("*")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (selErr) throw selErr;
  if (existing) return existing as Household;

  // 2) cria casa (invite_code é NOT NULL no seu banco)
  let lastErr: any = null;

  for (let attempt = 1; attempt <= 5; attempt++) {
    const { data: created, error: insErr } = await supabase
      .from("households")
      .insert({
        owner_user_id: user.id,
        name: "Casa PlantaCheck",
        invite_code: makeInviteCode(7),
      })
      .select("*")
      .single();

    if (!insErr) return created as Household;

    lastErr = insErr;

    // colisão de invite_code (se tiver UNIQUE)
    const msg = (insErr?.message ?? "").toLowerCase();
    const code = (insErr?.code ?? "").toString();
    const details = (insErr?.details ?? "").toLowerCase();
    const looksLikeUnique =
      msg.includes("duplicate key") || msg.includes("unique") || details.includes("duplicate") || code === "23505";

    if (!looksLikeUnique) throw insErr;
  }

  throw lastErr ?? new Error("Não foi possível criar a casa. Tente novamente.");
}

export async function updateHouseholdName(householdId: string, name: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("households").update({ name }).eq("id", householdId);
  if (error) throw error;
}
