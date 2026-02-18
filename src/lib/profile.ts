// src/lib/profile.ts
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export async function ensureProfile() {
  const { data: authData, error: authErr } = await supabaseBrowser.auth.getUser();
  if (authErr) throw authErr;

  const user = authData.user;
  if (!user) return null;

  const { data: existing, error: selErr } = await supabaseBrowser
    .from("profiles")
    .select("id,email,has_password")
    .eq("id", user.id)
    .maybeSingle();

  if (selErr) throw selErr;

  if (existing) return existing;

  const payload = {
    id: user.id,
    email: user.email ?? null,
    has_password: false,
  };

  const { data: inserted, error: insErr } = await supabaseBrowser
    .from("profiles")
    .insert(payload)
    .select("id,email,has_password")
    .single();

  if (insErr) throw insErr;

  return inserted;
}

export async function setHasPasswordTrue() {
  const { data: authData, error: authErr } = await supabaseBrowser.auth.getUser();
  if (authErr) throw authErr;

  const user = authData.user;
  if (!user) throw new Error("Usuário não autenticado.");

  const { error } = await supabaseBrowser
    .from("profiles")
    .update({ has_password: true })
    .eq("id", user.id);

  if (error) throw error;
}
