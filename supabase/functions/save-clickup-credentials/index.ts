// supabase/functions/save-clickup-credentials/index.ts
// Invocada diretamente pelo navegador (não por Database Webhook) logo após
// o login validar o token pessoal do ClickUp e autenticar no Supabase.
// Guarda esse token pessoal criptografado (AES-GCM via Web Crypto — nunca
// em texto puro, nunca via pgcrypto/SQL, já que a chave de criptografia
// nunca pode chegar ao navegador) numa tabela que só service_role enxerga
// (usuarios_clickup, RLS sem nenhuma policy pra anon/authenticated). É essa
// tabela que as Edge Functions sync-*-clickup consultam depois, em
// segundo plano, pra saber com o token de quem sincronizar.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const TOKEN_ENCRYPTION_KEY = Deno.env.get("TOKEN_ENCRYPTION_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status });
}

async function importEncryptionKey(): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(TOKEN_ENCRYPTION_KEY), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
}

async function encryptToken(plainToken: string): Promise<{ encrypted: string; iv: string }> {
  const key = await importEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plainToken));
  const toB64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  return { encrypted: toB64(cipherBuf), iv: toB64(iv) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Método não suportado" }, 405);
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !TOKEN_ENCRYPTION_KEY) {
      throw new Error("Variáveis de ambiente não configuradas (SUPABASE_URL/SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY/TOKEN_ENCRYPTION_KEY)");
    }

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) {
      return jsonResponse({ success: false, error: "Authorization ausente" }, 401);
    }

    const { clickup_token } = await req.json();
    if (!clickup_token || typeof clickup_token !== "string") {
      return jsonResponse({ success: false, error: "clickup_token é obrigatório" }, 400);
    }

    // 1) Resolve a identidade de quem chamou pelo JWT recebido — nunca
    // confiar num user id mandado pelo próprio cliente.
    const authedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await authedClient.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonResponse({ success: false, error: "Sessão inválida" }, 401);
    }
    const userId = userData.user.id;

    // 2) Confere o token do ClickUp direto na origem (defesa em profundidade
    // — o login no navegador já validou, mas não custa confirmar de novo
    // aqui antes de gravar).
    const cuRes = await fetch("https://api.clickup.com/api/v2/user", {
      headers: { Authorization: clickup_token },
    });
    if (!cuRes.ok) {
      return jsonResponse({ success: false, error: "Token do ClickUp inválido" }, 400);
    }
    const cuData = await cuRes.json();
    const clickupUser = cuData?.user;

    // 3) Criptografa e grava usando a service role key (contorna RLS —
    // usuarios_clickup não tem nenhuma policy pra anon/authenticated).
    const { encrypted, iv } = await encryptToken(clickup_token);
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error: upsertErr } = await supabaseAdmin.from("usuarios_clickup").upsert({
      user_id: userId,
      clickup_user_id: clickupUser?.id ? String(clickupUser.id) : null,
      nome: clickupUser?.username || clickupUser?.email || null,
      token_encrypted: encrypted,
      token_iv: iv,
      updated_at: new Date().toISOString(),
    });

    if (upsertErr) {
      console.error("[save-clickup-credentials] Falha ao gravar credenciais:", upsertErr.message);
      return jsonResponse({ success: false, error: upsertErr.message }, 500);
    }

    return jsonResponse({ success: true });
  } catch (error) {
    console.error("[save-clickup-credentials] Erro:", error.message);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
});
