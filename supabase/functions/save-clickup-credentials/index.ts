// supabase/functions/save-clickup-credentials/index.ts
//
// Chamada pelo frontend após o usuário validar seu Personal Token do ClickUp.
// Recebe o token em texto claro, criptografa com AES-GCM, e faz upsert em
// usuarios_clickup. Desta forma, as Edge Functions de sync podem depois
// resolver o token pessoal para cada ação.
//
// Segurança (correção 19/08): a versão anterior confiava cegamente no
// {user: {email, id, username}} que o próprio cliente mandava no corpo —
// como o endpoint é público (CORS *), qualquer requisição podia sobrescrever
// o token salvo de OUTRO vendedor só informando o e-mail dele. Agora a
// identidade vem do JWT de sessão (validado via supabase.auth.getUser(),
// nunca do corpo da requisição) e o token do ClickUp é conferido direto na
// origem antes de ser salvo.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { encryptToken } from "../_shared/resolve-token.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
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
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Authorization ausente." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { token } = await req.json();
    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: "token é obrigatório." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Variáveis SUPABASE_URL/SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY não configuradas.");
    }

    // 1) Resolve a identidade de quem chamou pelo JWT recebido — nunca
    // confiar num e-mail/id mandado pelo próprio cliente.
    const authedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await authedClient.auth.getUser();
    if (userErr || !userData?.user?.email) {
      return new Response(
        JSON.stringify({ success: false, error: "Sessão inválida." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const verifiedEmail = userData.user.email;

    // 2) Confere o token do ClickUp direto na origem (defesa em profundidade
    // — o login no navegador já validou, mas não custa confirmar de novo
    // aqui antes de gravar).
    const cuRes = await fetch("https://api.clickup.com/api/v2/user", {
      headers: { Authorization: token },
    });
    if (!cuRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: "Token do ClickUp inválido." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const cuData = await cuRes.json();
    const clickupUser = cuData?.user;
    if (!clickupUser?.id) {
      return new Response(
        JSON.stringify({ success: false, error: "Resposta inesperada do ClickUp." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3) Criptografar o token
    const { encrypted_token, iv } = await encryptToken(token.trim());

    // 4) Upsert em usuarios_clickup usando a identidade verificada — a
    // service role key contorna RLS (usuarios_clickup não tem policy
    // nenhuma pra anon/authenticated).
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { error } = await supabase
      .from("usuarios_clickup")
      .upsert(
        {
          user_email: verifiedEmail,
          clickup_user_id: String(clickupUser.id),
          username: clickupUser.username || clickupUser.email || verifiedEmail,
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

    console.log(`[save-clickup-credentials] Credenciais salvas para ${verifiedEmail} (clickup_user_id=${clickupUser.id}).`);

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
