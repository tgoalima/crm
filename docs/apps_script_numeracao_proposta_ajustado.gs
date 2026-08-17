/***********************
 * ClickUp Proposal Number Generator (Deals)
 * Web App endpoint:
 *   .../exec?id=<DEAL_TASK_ID>   (id = task ID do NEGÓCIO, não da Conta)
 *
 * AJUSTE (17/08): GET não escreve mais nada (só valida/consulta). POST é
 * quem executa de fato, e agora é idempotente — se o negócio já tem número
 * atribuído, devolve o mesmo em vez de consumir um número novo e duplicar
 * linha na planilha. Resposta sempre em JSON (antes o caso de id ausente
 * devolvia texto puro).
 *
 * Script Properties required:
 * - PROPOSALS_SHEET_ID
 * - LOGS_SHEET_ID
 * - CLICKUP_TOKEN
 * - DEAL_PROPOSAL_FIELD_ID  (c44cc05d-303f-47e2-b243-40c6b26b732f)
 * Optional:
 * - CLICKUP_TEAM_ID (fallback URL only)
 ***********************/

function doGet(e) {
  // AJUSTE: GET nunca cria nem grava nada — só valida o id e informa se já
  // existe número atribuído, pra quem for integrar poder checar antes.
  return handleGet_(e);
}

function doPost(e) {
  return handlePost_(e);
}

function handleGet_(e) {
  const dealId = (e && e.parameter && e.parameter.id) ? String(e.parameter.id).trim() : "";

  if (!dealId || dealId === "{id}" || dealId === "ID da Tarefa") {
    return json_({ ok: false, dealTaskId: dealId || null, error: "Missing id (use ?id=TASK_ID)" });
  }

  try {
    const cfg = getConfig_();
    const deal = clickUpGetTask_(dealId, cfg.CLICKUP_TOKEN);
    const existing = getCustomFieldValueById_(deal, cfg.DEAL_PROPOSAL_FIELD_ID);

    return json_({
      ok: true,
      dealTaskId: dealId,
      alreadyAssigned: !!existing,
      proposal: existing ? String(existing) : null,
      error: null
    });
  } catch (err) {
    log_("ERROR", (err && err.stack) ? String(err.stack) : String(err), dealId, {});
    return json_({ ok: false, dealTaskId: dealId, error: String(err) });
  }
}

function handlePost_(e) {
  log_("INFO", "Webhook HIT (POST)", "", { params: e ? e.parameter : null });

  const dealId = (e && e.parameter && e.parameter.id) ? String(e.parameter.id).trim() : "";

  if (!dealId) {
    log_("WARN", "Missing deal id. Expected /exec?id=<dealId>", "", { params: e ? e.parameter : null });
    return json_({ ok: false, dealTaskId: null, error: "Missing id (use ?id=TASK_ID)" });
  }

  // evita tentativa com placeholder
  if (dealId === "{id}" || dealId === "ID da Tarefa") {
    log_("WARN", "Ignoring placeholder id", "", { id: dealId });
    return json_({ ok: false, dealTaskId: dealId, error: "Ignoring placeholder id" });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const cfg = getConfig_();

    // 1) Load Deal task (full)
    const deal = clickUpGetTask_(dealId, cfg.CLICKUP_TOKEN);

    // AJUSTE — IDEMPOTÊNCIA: se o negócio já tem número atribuído, devolve o
    // mesmo sem consumir um número novo em Config!B1 nem duplicar linha na
    // planilha. Isso é o que faltava pra chamar esse endpoint com segurança
    // mais de uma vez (retry de rede, clique duplo, etc.) para o mesmo negócio.
    const existingProposal = getCustomFieldValueById_(deal, cfg.DEAL_PROPOSAL_FIELD_ID);
    if (existingProposal) {
      const clienteNomeExist = findAccountNameFromDeal_(deal, cfg) || "";
      const dealUrlRawExist = (deal && deal.url) ? String(deal.url) : buildClickUpTaskUrlFallback_(cfg, dealId);
      log_("INFO", "Proposal already assigned, returning existing (idempotent)", dealId, { proposal: existingProposal });
      return json_({
        ok: true,
        alreadyAssigned: true,
        proposal: String(existingProposal),
        dealTaskId: dealId,
        dealUrl: extractPureUrl_(dealUrlRawExist),
        cliente: clienteNomeExist,
        error: null
      });
    }

    // 2) Find Cliente (Account name) from linked tasks
    const clienteNome = findAccountNameFromDeal_(deal, cfg) || "";

    // 3) Generate next proposal number
    const ss = SpreadsheetApp.openById(cfg.PROPOSALS_SHEET_ID);
    const configSheet = mustGetSheet_(ss, "Config");

    const lastNumRaw = configSheet.getRange("B1").getValue();
    const lastNum = Number(lastNumRaw);

    if (!Number.isFinite(lastNum) || lastNum <= 0) {
      throw new Error('Config!B1 inválido. Valor atual: "' + lastNumRaw + '". Ajuste para o último número real (ex.: 12729).');
    }

    const nextNum = lastNum + 1;
    const now = new Date();
    const year = now.getFullYear();
    const proposalStr = nextNum + "/" + year;

    // reserve number immediately (under lock)
    configSheet.getRange("B1").setValue(nextNum);

    // 4) Write history in the year sheet
    const yearSheetName = String(year);
    const yearSheet = ss.getSheetByName(yearSheetName) || ss.insertSheet(yearSheetName);
    ensureYearHeader_(yearSheet);

    // URL pura do Deal
    const dealUrlRaw = (deal && deal.url) ? String(deal.url) : buildClickUpTaskUrlFallback_(cfg, dealId);
    const dealUrl = extractPureUrl_(dealUrlRaw);

    // Escreve a linha com texto "Abrir Deal" (sem fórmula)
    yearSheet.appendRow([nextNum, year, clienteNome, now, "Abrir Deal"]);
    const row = yearSheet.getLastRow();

    // Aplica link clicável (RichText) na célula Projeto (E)
    if (dealUrl) {
      const rich = SpreadsheetApp.newRichTextValue()
        .setText("Abrir Deal")
        .setLinkUrl(dealUrl)
        .build();
      yearSheet.getRange(row, 5).setRichTextValue(rich);
    }

    // Confirma escrita
    log_("INFO", "Sheet row appended", dealId, {
      sheet: yearSheetName,
      row: row,
      values: [nextNum, year, clienteNome, now.toISOString(), dealUrl]
    });

    // Formatação (centralização, negrito parcial, bordas)
    formatProposalRow_(yearSheet, row);

    // Mostrar apenas a data (sem hora) na coluna D
    yearSheet.getRange(row, 4).setNumberFormat("dd/MM/yyyy");

    // 5) Update ClickUp custom field "Proposal number"
    clickUpUpdateCustomField_(dealId, cfg.DEAL_PROPOSAL_FIELD_ID, proposalStr, cfg.CLICKUP_TOKEN);

    log_("INFO", "Proposal assigned", dealId, {
      proposal: proposalStr,
      number: nextNum,
      year: year,
      cliente: clienteNome,
      dealUrl: dealUrl
    });

    return json_({
      ok: true,
      alreadyAssigned: false,
      proposal: proposalStr,
      dealTaskId: dealId,
      dealUrl: dealUrl,
      cliente: clienteNome,
      error: null,
      // campos extras (não fazem parte do contrato mínimo, mas continuam úteis)
      number: nextNum,
      year: year,
      sheet: yearSheetName,
      sheetRow: row
    });

  } catch (err) {
    const msg = (err && err.stack) ? String(err.stack) : String(err);
    log_("ERROR", msg, dealId, {});
    return json_({ ok: false, dealTaskId: dealId, error: String(err) });

  } finally {
    lock.releaseLock();
  }
}

/***************
 * Extract URL from any string (including markdown)
 ***************/
function extractPureUrl_(value) {
  const s = String(value || "").trim();
  const urlMatch = s.match(/https?:\/\/[^\s)]+/i);
  if (urlMatch && urlMatch[0]) return urlMatch[0].trim();
  return s;
}

/***************
 * Format the newly appended proposal row
 * - Center all columns A:E
 * - Bold: Nº (A), Ano (B), Data (D)
 * - Normal: Cliente (C), Projeto (E)
 * - Black borders (outline + inner)
 ***************/
function formatProposalRow_(sheet, row) {
  const range = sheet.getRange(row, 1, 1, 5); // A:E

  range.setHorizontalAlignment("center")
       .setVerticalAlignment("middle");

  sheet.getRange(row, 1).setFontWeight("bold");   // Nº
  sheet.getRange(row, 2).setFontWeight("bold");   // Ano
  sheet.getRange(row, 4).setFontWeight("bold");   // Data

  sheet.getRange(row, 3).setFontWeight("normal"); // Cliente
  sheet.getRange(row, 5).setFontWeight("normal"); // Projeto

  range.setBorder(true, true, true, true, true, true, "black", SpreadsheetApp.BorderStyle.SOLID);
}

/***************
 * Configuration
 ***************/
function getConfig_() {
  const props = PropertiesService.getScriptProperties();

  const PROPOSALS_SHEET_ID = props.getProperty("PROPOSALS_SHEET_ID");
  const LOGS_SHEET_ID = props.getProperty("LOGS_SHEET_ID");
  const CLICKUP_TOKEN = props.getProperty("CLICKUP_TOKEN");
  const DEAL_PROPOSAL_FIELD_ID = props.getProperty("DEAL_PROPOSAL_FIELD_ID");
  const CLICKUP_TEAM_ID = props.getProperty("CLICKUP_TEAM_ID") || "";

  if (!PROPOSALS_SHEET_ID) throw new Error("Missing Script Property: PROPOSALS_SHEET_ID");
  if (!LOGS_SHEET_ID) throw new Error("Missing Script Property: LOGS_SHEET_ID");
  if (!CLICKUP_TOKEN) throw new Error("Missing Script Property: CLICKUP_TOKEN");
  if (!DEAL_PROPOSAL_FIELD_ID) throw new Error("Missing Script Property: DEAL_PROPOSAL_FIELD_ID");

  return {
    PROPOSALS_SHEET_ID: PROPOSALS_SHEET_ID,
    LOGS_SHEET_ID: LOGS_SHEET_ID,
    CLICKUP_TOKEN: CLICKUP_TOKEN,
    DEAL_PROPOSAL_FIELD_ID: DEAL_PROPOSAL_FIELD_ID,
    CLICKUP_TEAM_ID: CLICKUP_TEAM_ID
  };
}

/***************
 * Sheets helpers
 ***************/
function mustGetSheet_(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Aba não encontrada na planilha de propostas: "' + name + '"');
  return sh;
}

function ensureYearHeader_(sheet) {
  const header = ["Nº DA PROPOSTA", "Ano", "Cliente", "Data", "Projeto"];

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(header);
    return;
  }

  const firstRow = sheet.getRange(1, 1, 1, header.length).getValues()[0];
  const ok = header.every(function (h, i) {
    return String(firstRow[i] || "").trim() === h;
  });

  if (!ok) {
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
  }
}

/***************
 * Logging to Logs sheet
 ***************/
function log_(level, message, dealId, extraObj) {
  try {
    const props = PropertiesService.getScriptProperties();
    const logsId = props.getProperty("LOGS_SHEET_ID");
    if (!logsId) return;

    const ss = SpreadsheetApp.openById(logsId);
    const sh = ss.getSheetByName("Logs") || ss.insertSheet("Logs");

    if (sh.getLastRow() === 0) {
      sh.appendRow(["Timestamp", "Level", "Message", "DealId", "Extra(JSON)"]);
    }

    const ts = new Date();
    const extra = extraObj ? JSON.stringify(extraObj) : "";
    sh.appendRow([ts, level, String(message).slice(0, 5000), dealId || "", extra]);

  } catch (e) {
    // don't break main flow
  }
}

/***************
 * ClickUp API
 ***************/
function clickUpGetTask_(taskId, token) {
  const url = "https://api.clickup.com/api/v2/task/" + encodeURIComponent(taskId);

  const res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { Authorization: token },
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  const body = res.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error("ClickUp GET task failed (" + code + "): " + body);
  }
  return JSON.parse(body);
}

function clickUpUpdateCustomField_(taskId, fieldId, value, token) {
  const url = "https://api.clickup.com/api/v2/task/" + encodeURIComponent(taskId) + "/field/" + encodeURIComponent(fieldId);
  const payload = { value: String(value) };

  const res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  const body = res.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error("ClickUp field update failed (" + code + "): " + body);
  }
}

/***************
 * Account discovery (Deal -> linked tasks -> Account)
 ***************/
function findAccountNameFromDeal_(deal, cfg) {
  const linkedIds = extractLinkedTaskIds_(deal);
  if (!linkedIds.length) return "";

  let fallbackName = "";

  for (let i = 0; i < linkedIds.length; i++) {
    const linkedTaskId = linkedIds[i];
    try {
      const t = clickUpGetTask_(linkedTaskId, cfg.CLICKUP_TOKEN);
      if (!fallbackName) fallbackName = t.name || "";

      const crmType = getCustomFieldValueByName_(t, "CRM Item Type");
      if (crmType && String(crmType).toLowerCase() === "account") {
        return t.name || "";
      }
    } catch (e) {
      // try next
    }
  }

  return fallbackName;
}

function extractLinkedTaskIds_(deal) {
  const raw = deal.linked_tasks || deal.linkedTasks || deal.linked || [];
  const ids = [];

  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i++) {
      const item = raw[i];
      const id = item ? (item.task_id || item.taskId || item.linked_task_id || item.id) : "";
      if (id) ids.push(String(id));
    }
  } else if (raw && typeof raw === "object") {
    for (const k in raw) {
      const v = raw[k];
      const id2 = v ? (v.task_id || v.taskId || v.id) : "";
      if (id2) ids.push(String(id2));
    }
  }

  const uniq = {};
  const out = [];
  for (let j = 0; j < ids.length; j++) {
    const v2 = ids[j];
    if (!uniq[v2]) {
      uniq[v2] = true;
      out.push(v2);
    }
  }
  return out;
}

function getCustomFieldValueByName_(taskObj, fieldName) {
  const cfs = taskObj && taskObj.custom_fields ? taskObj.custom_fields : [];
  if (!Array.isArray(cfs)) return null;

  for (let i = 0; i < cfs.length; i++) {
    const cf = cfs[i];
    if (cf && cf.name === fieldName) return cf.value;
  }
  return null;
}

// AJUSTE: novo helper — busca por ID do campo (mais confiável que por nome),
// usado pra checagem de idempotência (já tem número atribuído?).
function getCustomFieldValueById_(taskObj, fieldId) {
  const cfs = taskObj && taskObj.custom_fields ? taskObj.custom_fields : [];
  if (!Array.isArray(cfs)) return null;

  for (let i = 0; i < cfs.length; i++) {
    const cf = cfs[i];
    if (cf && cf.id === fieldId && cf.value !== undefined && cf.value !== null && cf.value !== "") {
      return cf.value;
    }
  }
  return null;
}

/***************
 * Optional fallback URL
 ***************/
function buildClickUpTaskUrlFallback_(cfg, taskId) {
  if (!cfg.CLICKUP_TEAM_ID) return "https://app.clickup.com/t/" + taskId;
  return "https://app.clickup.com/" + cfg.CLICKUP_TEAM_ID + "/t/" + taskId;
}

/***************
 * Response helpers
 ***************/
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function text_(txt) {
  return ContentService.createTextOutput(String(txt))
    .setMimeType(ContentService.MimeType.TEXT);
}
