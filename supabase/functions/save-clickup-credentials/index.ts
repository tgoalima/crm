// supabase/functions/save-clickup-credentials/index.ts
//
// Chamada pelo frontend após o usuário validar seu Personal Token do ClickUp.
// Recebe o token em texto claro, criptografa com AES-GCM, e faz upsert em
// usuarios_clickup. Desta forma, as Edge Functions de sync podem depois
// resolver o token pessoal para cada ação.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { encryptToken } from "../_shared/resolve-token.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const { token, user } = await req.json();

    if (!token || !user?.email) {
      return new Response(
        JSON.stringify({ success: false, error: "Token e user.email são obrigatórios." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Variáveis SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configuradas.");
    }

    // Criptografar o token
    const { encrypted_token, iv } = await encryptToken(token.trim());

    // Upsert em usuarios_clickup
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { error } = await supabase
      .from("usuarios_clickup")
      .upsert(
        {
          user_email: user.email,
          clickup_user_id: String(user.id),
          username: user.username || user.email,
          encrypted_token,
          iv,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_email" }
      );

    if (error) {
      console.error("[save-clickup-credentials] Erro no upsert:", error.message);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[save-clickup-credentials] Credenciais salvas para ${user.email} (id=${user.id}).`);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[save-clickup-credentials] Erro:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
