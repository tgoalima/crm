// supabase/functions/_shared/format-phone.ts
//
// Custom fields do tipo "phone" no ClickUp exigem o número com código de
// país (formato "+55..."), senão a criação da tarefa falha com
// FIELD_016 "Value is not a valid phone number" — foi exatamente o que
// aconteceu com um telefone digitado como "(47) 3248-5315" (formato
// brasileiro comum, sem o "+55"), travando a sincronização da conta e,
// em cadeia, do negócio vinculado a ela (que depende da conta já estar
// sincronizada). Números já em formato internacional (começando com "+")
// são mantidos como estão.

export function formatPhoneForClickUp(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("+")) {
    return /\d/.test(trimmed) ? trimmed : null;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  return `+55${digits}`; // assume Brasil quando não vem com código de país
}
