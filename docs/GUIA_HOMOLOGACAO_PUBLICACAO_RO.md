# Guia de homologação e publicação — Gestão de R.Os

Este roteiro publica a gestão estruturada de Registros de Oportunidade (R.O.) no CRM e a consulta correspondente no ClickUp Brain. Ele não cria tarefas R.O. no ClickUp: a sincronização dedicada de tarefas é uma entrega posterior, pois exige fila persistente, reenvio idempotente e reconciliação.

## Escopo da publicação

- Schema e regras transacionais de R.Os.
- API `api-ros`, interface geral, painel lateral, operações de aprovação, renovação, envio, substituição e Ficha 360º.
- Consulta `consultar_status_ros` no MCP/ClickUp Brain, com evidências humanas e cobertura explícita.
- Correção visual da Ficha 360º para situação e vigência.

## Pré-requisitos e pontos de parada

1. Executar os testes locais e confirmar que a árvore Git está limpa.
2. Criar backup lógico do banco antes de qualquer migration.
3. Consultar o banco para confirmar que as tabelas de R.O. ainda não existem e que as seis migrations abaixo ainda não foram aplicadas. Se alguma já existir, **parar** e reconciliar o estado antes de continuar.
4. Obter os IDs ClickUp reais de humanos, agentes e sistema. Não ativar o relatório por fabricante com uma classificação fictícia ou incompleta.
5. Fazer a publicação em uma janela combinada com Fabio, Thiago, Marcos ou Lucas para validar dados reais imediatamente após o deploy.

## Ordem obrigatória das migrations

Aplicar exatamente nesta ordem, usando `psql` com `ON_ERROR_STOP=1` e registrando a saída de cada arquivo:

1. `supabase/migrations/20260912a_registros_oportunidade.sql`
2. `supabase/migrations/20260912b_ro_operacoes.sql`
3. `supabase/migrations/20260912c_ro_resumo_agregado.sql`
4. `supabase/migrations/20260912d_ro_registrar_envio.sql`
5. `supabase/migrations/20260912e_ro_responder_renovacao_versao.sql`
6. `supabase/migrations/20260912f_ro_substituir_validacoes.sql`

Não aplique migrations de R.O. fora dessa ordem. A migration `f` atualiza a função de substituição criada pelas anteriores.

## Configuração de autores

Antes de homologar evidências humanas, definir `CRM_AUTORES_CLASSIFICACAO_JSON` tanto em `api-ros` como em `mcp-brain`. O valor é um objeto JSON cujas chaves são IDs ClickUp e os valores são somente `humano`, `agente`, `sistema` ou `desconhecido`.

Exemplo de estrutura, com IDs ilustrativos que devem ser substituídos pelos IDs reais:

```json
{
  "123": "humano",
  "456": "humano",
  "-789": "agente",
  "900": "sistema"
}
```

Ausência de configuração ou autor sem classificação deve resultar em cobertura desconhecida; nunca em uma falsa conclusão de que não houve atualização humana.

## Ordem da publicação

1. Fazer backup e aplicar as migrations.
2. Copiar/deploy das Edge Functions `api-ros` e `mcp-brain` junto com seus módulos compartilhados.
3. Configurar ou atualizar `CRM_AUTORES_CLASSIFICACAO_JSON` e confirmar os demais segredos existentes de Supabase, MCP e ClickUp sem expô-los em logs.
4. Publicar o frontend. A versão de cache de `dist/empresas.js` deve ser `5.16`; confirmar que o `index.html` entregue contém esse valor.
5. Reiniciar somente os serviços necessários e consultar logs de inicialização sem registrar tokens.

## Homologação mínima com dados reais

Usar uma oportunidade de teste ou uma R.O. criada para validação e registrar o resultado de cada item:

1. Criar R.O. vinculada a uma oportunidade existente. Tentar criar sem oportunidade e confirmar bloqueio.
2. Enviar ao fabricante, aprovar com número e vencimento, e conferir situação e vigência na tabela e na Ficha 360º da conta.
3. Solicitar renovação e confirmar que o número da R.O. permanece o mesmo enquanto o ciclo está pendente.
4. Aprovar renovação e confirmar atualização do vencimento e do ciclo.
5. Criar substituta somente depois das regras permitirem; confirmar que a anterior não é marcada como substituída antes da aprovação da sucessora.
6. Consultar uma conta com mais de uma oportunidade na Ficha 360º e conferir agrupamento, links e criação de nova R.O. pela oportunidade correta.
7. Com Fabio, perguntar ao Brain: `Qual o status das R.Os Dell?` e `Prepare a atualização das R.Os Fortinet`. Confirmar fabricante, número, oportunidade, prazo, última evidência humana, alertas e cobertura.
8. Inserir ou selecionar um evento de agente conhecido e outro de autoria desconhecida. Confirmar que não entram como atualização humana e que a cobertura é sinalizada quando necessário.

## Critérios de aprovação

A publicação é aceita se o CRM salva e consulta R.Os sem duplicação, regras de renovação/substituição são respeitadas, a Ficha 360º mostra prazos reais, e o Brain distingue ausência confirmada de cobertura desconhecida. Falha no ClickUp não pode apagar o registro salvo no CRM.

## Próxima entrega após homologação

Após esta validação, implementar `sync-ro-clickup` com fila persistente, idempotência, reenvio e reconciliação antes de criar tarefas R.O. dedicadas no ClickUp.
