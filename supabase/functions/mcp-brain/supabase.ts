// Cliente Supabase somente leitura para o MCP server.
// Usa a ANON key (não service_role) porque as tabelas consultadas aqui
// (propostas, itens_proposta, produtos, distribuidores) já têm policy de
// SELECT liberada para o role anon (ver supabase/migrations/20260712_enable_rls.sql).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn("SUPABASE_URL ou SUPABASE_ANON_KEY não configurados — queries ao Supabase vão falhar.");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
