// Deno Edge Function: mcp-brain
// Servidor MCP (JSON-RPC 2.0 sobre HTTP, modo stateless) que expõe o banco
// Supabase deste CRM como fonte de dados para o ClickUp Brain.
//
// Implementa a superfície mínima do protocolo MCP necessária para tools
// (initialize, tools/list, tools/call) em vez de depender do SDK oficial via
// npm: specifier — evita depender de um import não testado no runtime de
// Edge Functions da Supabase para uma superfície tão pequena (7 tools).
//
// Usa Deno.serve() nativo (não o std/http/server.ts legado usado nas outras
// functions deste projeto): requisições do cliente MCP do ClickUp travavam
// indefinidamente sem nenhum log do nosso código rodar, indicando que o
// parser HTTP antigo do std não lida bem com o que o cliente envia.

import { TOOLS, callTool } from "./tools.ts";

const MCP_AUTH_KEY = Deno.env.get("MCP_AUTH_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-mcp-key",
};

function jsonRpcResult(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const debugHeaders: Record<string, string> = {};
  for (const [k, v] of req.headers.entries()) {
    debugHeaders[k] = k === "authorization" || k === "x-mcp-key" ? "(presente, omitido)" : v;
  }
  console.log(`[mcp-brain] ${req.method} ${req.url} headers=${JSON.stringify(debugHeaders)}`);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    console.log(`[mcp-brain] método não-POST recebido: ${req.method}`);
    return jsonResponse({ error: "Method not allowed. Use POST." }, 405);
  }

  const authHeader = req.headers.get("authorization") || "";
  const bearerKey = authHeader.replace(/^Bearer\s+/i, "");
  const providedKey = req.headers.get("x-mcp-key") || bearerKey;

  if (!MCP_AUTH_KEY || providedKey !== MCP_AUTH_KEY) {
    console.log("[mcp-brain] 401 — chave ausente ou incorreta");
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let body: any;
  try {
    const bodyText = await Promise.race([
      req.text(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("TIMEOUT_LENDO_BODY_5S")), 5000)
      ),
    ]);
    console.log(`[mcp-brain] body recebido (${bodyText.length} bytes): ${bodyText.slice(0, 500)}`);
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch (e) {
    console.error(`[mcp-brain] falha lendo/parseando body: ${e.message}`);
    return jsonResponse(jsonRpcError(null, -32700, "Parse error"), 400);
  }

  const { id, method, params } = body || {};
  console.log(`[mcp-brain] método JSON-RPC: ${method}`);

  try {
    switch (method) {
      case "initialize":
        return jsonResponse(
          jsonRpcResult(id, {
            protocolVersion: "2025-03-26",
            capabilities: { tools: {} },
            serverInfo: { name: "supabase-crm-suprimatica", version: "1.0.0" },
          }),
        );

      case "notifications/initialized":
        return new Response(null, { status: 202, headers: corsHeaders });

      case "tools/list":
        return jsonResponse(jsonRpcResult(id, { tools: TOOLS }));

      case "tools/call": {
        const { name, arguments: args } = params || {};
        const result = await callTool(name, args || {});
        return jsonResponse(
          jsonRpcResult(id, {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          }),
        );
      }

      default:
        return jsonResponse(jsonRpcError(id, -32601, `Método não suportado: ${method}`));
    }
  } catch (error) {
    console.error("[mcp-brain] Erro:", error.message);
    return jsonResponse(jsonRpcError(id, -32000, error.message));
  }
});
