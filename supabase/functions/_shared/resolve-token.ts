// supabase/functions/_shared/resolve-token.ts
//
// Módulo utilitário para resolver o token pessoal do ClickUp a partir do
// criado_por_user_id. Usado por todas as Edge Functions de sync.
//
// Fluxo:
//   1. Recebe criado_por_user_id (clickup_user_id numérico)
//   2. Busca o registro em usuarios_clickup
//   3. Descriptografa o token com AES-GCM usando TOKEN_ENCRYPTION_KEY
//   4. Retorna o token em texto claro
//   Se criado_por_user_id for null/undefined ou não encontrar o registro,
//   retorna CLICKUP_API_TOKEN (fallback global).

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const CLICKUP_API_TOKEN = Deno.env.get("CLICKUP_API_TOKEN") || "";
const TOKEN_ENCRYPTION_KEY = Deno.env.get("TOKEN_ENCRYPTION_KEY") || "";

/**
 * Converte uma string base64 em ArrayBuffer.
 */
function base64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

/**
 * Converte um ArrayBuffer em string base64.
 */
function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * Deriva uma CryptoKey a partir da chave de texto (TOKEN_ENCRYPTION_KEY).
 * Usa SHA-256 do texto para gerar exatamente 256 bits.
 */
async function deriveKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyData = await crypto.subtle.digest("SHA-256", enc.encode(TOKEN_ENCRYPTION_KEY));
  return crypto.subtle.importKey("raw", keyData, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/**
 * Criptografa um token com AES-GCM.
 * Retorna { encrypted_token, iv } ambos em base64.
 */
export async function encryptToken(plainToken: string): Promise<{ encrypted_token: string; iv: string }> {
  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96 bits recomendado para AES-GCM
  const enc = new TextEncoder();
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plainToken)
  );
  return {
    encrypted_token: bufferToBase64(cipherBuf),
    iv: bufferToBase64(iv.buffer),
  };
}

/**
 * Descriptografa um token AES-GCM.
 */
export async function decryptToken(encryptedB64: string, ivB64: string): Promise<string> {
  const key = await deriveKey();
  const ivBuf = base64ToBuffer(ivB64);
  const cipherBuf = base64ToBuffer(encryptedB64);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(ivBuf) },
    key,
    cipherBuf
  );
  return new TextDecoder().decode(plainBuf);
}

/**
 * Cria um SupabaseClient com service_role (para acessar usuarios_clickup).
 */
function getServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  return createClient(url, key);
}

/**
 * Dado um criado_por_user_id (clickup_user_id numérico), busca o token
 * pessoal descriptografado. Retorna CLICKUP_API_TOKEN se:
 *   - criado_por_user_id for null/undefined
 *   - não encontrar registro em usuarios_clickup
 *   - descriptografia falhar
 *   - TOKEN_ENCRYPTION_KEY não estiver configurada
 */
export async function resolveClickUpToken(
  criado_por_user_id?: string | null,
  supabase?: SupabaseClient
): Promise<string> {
  // Sem user_id → fallback global
  if (!criado_por_user_id) {
    console.log("[resolve-token] Sem criado_por_user_id, usando token global.");
    return CLICKUP_API_TOKEN;
  }

  // Sem chave de criptografia → fallback global
  if (!TOKEN_ENCRYPTION_KEY) {
    console.warn("[resolve-token] TOKEN_ENCRYPTION_KEY não configurada, usando token global.");
    return CLICKUP_API_TOKEN;
  }

  try {
    const client = supabase || getServiceClient();

    const { data, error } = await client
      .from("usuarios_clickup")
      .select("encrypted_token, iv")
      .eq("clickup_user_id", criado_por_user_id)
      .single();

    if (error || !data) {
      console.warn(`[resolve-token] Registro não encontrado para user_id=${criado_por_user_id}: ${error?.message || "sem dados"}`);
      return CLICKUP_API_TOKEN;
    }

    const plainToken = await decryptToken(data.encrypted_token, data.iv);
    console.log(`[resolve-token] Token pessoal resolvido para user_id=${criado_por_user_id}.`);
    return plainToken;
  } catch (err) {
    console.error(`[resolve-token] Erro ao resolver token para user_id=${criado_por_user_id}:`, err.message);
    return CLICKUP_API_TOKEN;
  }
}
