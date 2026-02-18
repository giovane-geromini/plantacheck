// src/lib/supabaseBrowser.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabaseBrowser = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // ✅ ESSENCIAL para magic link funcionar bem no browser
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,

    // ✅ força o fluxo que devolve `?code=...` no redirect
    flowType: "pkce",
  },
});
