-- supabase/migrations/20260819c_align_deselect_trigger_status.sql
--
-- auto_deselect_other_proposals() (trigger_deselect_other_proposals,
-- BEFORE INSERT OR UPDATE ON propostas) vem do schema original do projeto
-- (20260527_init.sql) e usa o vocabulário original de `situacao`
-- ('Não selecionada'), que ficou desatualizado — o app.js hoje usa
-- 'Desconsiderada' pra essa mesma regra de negócio (desconsiderar as
-- versões irmãs quando uma vira Selecionada), com sua própria lógica
-- explícita em handleUpdateVersionStatus.
--
-- Hoje o trigger fica dormente na prática (o app.js sempre desconsidera
-- as irmãs antes de marcar a nova como Selecionada, então não sobra
-- nenhuma irmã ainda 'Selecionada' quando o trigger roda) — mas ele
-- serve como rede de segurança pra qualquer escrita que não passe pelo
-- app.js. Alinhando o valor usado pra bater com o vocabulário real do
-- frontend, pra que essa rede de segurança nunca deixe uma proposta num
-- status que a interface não trata direito (o dropdown de status do
-- topo do editor de proposta não reconhece 'Não selecionada' e mostraria
-- errado como "Em Andamento").

CREATE OR REPLACE FUNCTION public.auto_deselect_other_proposals()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.situacao = 'Selecionada' AND (OLD.situacao IS DISTINCT FROM 'Selecionada' OR TG_OP = 'INSERT') THEN
        UPDATE propostas
        SET situacao = 'Desconsiderada'
        WHERE clickup_negocio_id = NEW.clickup_negocio_id
          AND id <> NEW.id
          AND situacao = 'Selecionada';
    END IF;
    RETURN NEW;
END;
$function$;
