# Plano de Migração das R.O.s do Agendor

> **Status:** prévia revisada; aguardando a validação de dados pelo Fábio.
> **Modo:** somente leitura e relatórios. Não há importação nesta fase.

## Fonte aceita

A única fonte permitida é a exportação do funil dedicado do Agendor:

`_arquivo_historico/planilhas_agendor/Agendor_Funil_R.Os.xlsx`

O arquivo foi conferido em 15/09/2026. Ele contém **74 R.O.s**, uma por negócio,
todas com `Funil = Registro de Oportunidades` e `Status = Em andamento`.

O script rejeita qualquer planilha de outro funil. A exportação genérica de
`Funil de Vendas` não deve ser usada nem como fonte nem para a planilha de
validação.

## O que a prévia faz

Para cada linha do funil dedicado, o script cria uma candidata de migração com
identificador estável `agendor-ro:<Código do Negócio>`. Ele lê dados do ClickUp
e do CRM apenas por `GET`, sem inserir, atualizar ou excluir nada.

O vínculo com a oportunidade do CRM exige correspondência exata do `Código do
Negócio` com o campo ClickUp `Agendor Deal ID`. Nomes parecidos não criam vínculo.
Duplicidade só é confirmada se oportunidade, fabricante e número coincidirem
com alta confiança.

## O que precisa ser validado pelo Fábio

A planilha de validação deve reunir todos os casos abaixo, preservando o valor
original do Agendor e sem preencher por suposição:

| Situação na exportação | Quantidade inicial | Tratamento na prévia |
| --- | ---: | --- |
| Sem número em `R.O I` | 23 | Mantida como candidata e marcada para informar o número oficial. |
| `1º Renovação` | 22 | R.O. sugerida como aprovada, mas o ciclo de renovação fica pendente. |
| `2º Renovação Manual` | 3 | R.O. sugerida como aprovada, mas o ciclo de renovação fica pendente. |
| Sem categoria exportada | 74 | Categoria fica obrigatoriamente em validação humana. |
| Fabricante não identificado com segurança | variável | Fábio confirma ou corrige; nenhum fabricante é inventado. |
| Vínculo ClickUp/CRM ausente ou ambíguo | variável | Fábio confirma a oportunidade correta ou mantém sem importação. |

As etapas `Backoffice`, `Aguardando Aprovação` e `Aprovado` são convertidas
somente em sugestões equivalentes do CRM. Renovação não é criada a partir da
etapa: faltam data de solicitação, vencimento anterior, novo vencimento e
evidências. Esses campos só poderão entrar após a validação humana.

## Resultado esperado da prévia

Em `reports/`, a execução gera:

- `ro_migracao_dry_run.csv`: todas as 74 candidatas e suas sugestões;
- `ro_migracao_pendentes.csv`: linhas que precisam de decisão;
- `ro_migracao_resumo.json`: contagens, origem da coleta e confirmação de zero
  escritas.

Campos importantes do CSV:

- `valor_bruto`, `numero_ro_sugerido`, `fabricante_sugerido` e confianças;
- `etapa_agendor`, `funil_agendor` e `situacao_operacional_sugerida`;
- `renovacao_confirmada`, que usa `revisao_humana_necessaria` quando aplicável;
- `status_vinculo`, `clickup_task_id`, `negocio_id` e `motivo_pendencia`.

## Execução na VPS

Antes de executar, coloque a exportação atual do funil de R.O.s no mesmo caminho
do repositório da VPS. Depois execute apenas a prévia:

```bash
cd /home/ubuntu/apps/suprimatica-crm
python3 scripts/migracao_ros_agendor.py \
  --dry-run \
  --planilha _arquivo_historico/planilhas_agendor/Agendor_Funil_R.Os.xlsx \
  --env-file /home/ubuntu/apps/supabase/docker/.env
```

O comando não tem modo de escrita. Se a planilha não for do funil `Registro de
Oportunidades`, ele encerra com erro antes de consultar ClickUp ou CRM.

## Próxima etapa

Depois de o Fábio devolver a planilha preenchida, faremos uma nova prévia com
as decisões registradas. Só então será elaborado, revisado e aprovado um
procedimento idempotente de importação; esta fase não cria R.O.s no CRM.
