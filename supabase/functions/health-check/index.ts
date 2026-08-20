// supabase/functions/health-check/index.ts
//
// Endpoint público (FUNCTIONS_VERIFY_JWT=false neste stack — sem necessidade
// de token) pra monitoramento externo (UptimeRobot etc.) confirmar que o
// banco e a integração com o ClickUp estão respondendo. Sem isso, uma queda
// só era percebida quando alguém notava um selo "falha" na UI ou lia log do
// Docker manualmente.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CLICKUP_API_TOKEN = Deno.env.get("CLICKUP_API_TOKEN") || "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  const checks: Record<string, boolean> = { database: false, clickup: false };
  const errors: Record<string, string> = {};

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configuradas");
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await supabase.from("produtos").select("id").limit(1);
    if (error) throw error;
    checks.database = true;
  } catch (e) {
    errors.database = e instanceof Error ? e.message : String(e);
  }

  try {
    if (!CLICKUP_API_TOKEN) throw new Error("CLICKUP_API_TOKEN não configurado");
    const res = await fetch("https://api.clickup.com/api/v2/user", {
      headers: { Authorization: CLICKUP_API_TOKEN },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    checks.clickup = true;
  } catch (e) {
    errors.clickup = e instanceof Error ? e.message : String(e);
  }

  const healthy = checks.database && checks.clickup;

  return new Response(
    JSON.stringify({
      status: healthy ? "ok" : "degraded",
      checks,
      ...(Object.keys(errors).length ? { errors } : {}),
      timestamp: new Date().toISOString(),
    }),
    {
      status: healthy ? 200 : 503,
      headers: { "Content-Type": "application/json" },
    },
  );
});
