# Área de Registros de Oportunidade (R.Os)

## Objetivo

Disponibilizar no CRM uma área operacional para criar, acompanhar e atualizar R.Os vinculadas a oportunidades existentes. A área atende Fabio, responsável pela criação, monitoramento e atualização nos portais dos fabricantes, e o backoffice formado por Thiago, Marcos e Lucas.

O CRM é a origem do trabalho diário. O ClickUp recebe a réplica das atividades comerciais e o ClickUp Brain consulta o CRM e as evidências humanas para preparar atualizações por fabricante.

## Regras de negócio confirmadas

- Uma R.O. só pode existir vinculada a uma oportunidade existente.
- Uma oportunidade pode ter várias R.Os; cada R.O. pertence a uma única oportunidade.
- A aprovação usa o número e o vencimento confirmados por e-mail ou portal do fabricante.
- Renovação normalmente mantém o número da R.O. e cria um ciclo de renovação no histórico.
- Dell permite até três renovações antes de exigir substituição por uma nova R.O.; a regra fica configurada por fabricante.
- Substituição cria uma R.O. sucessora no mesmo negócio e preserva a R.O. anterior para auditoria.
- R.O. encerrada, reprovada ou substituída não aparece por padrão nas listas operacionais, mas permanece pesquisável por situação.
- A gestão de R.Os não altera estágio, valor, previsão ou fechamento da oportunidade.

## Navegação e componentes

O menu principal terá a entrada **R.Os**. A tela geral será a central de trabalho de Fabio e do backoffice.

### Tela geral

O topo apresenta indicadores calculados a partir da listagem atual:

- aguardando aprovação;
- vencem nos próximos 15 dias;
- sem atualização humana no mês;
- R.Os operacionais exibidas no filtro.

Os filtros são fabricante, cliente, situação, vencimento próximo e período da atualização comercial. A tabela apresenta fabricante, número, cliente, oportunidade, categoria, cenário, situação, vencimento, ciclo de renovação e resumo da última atualização humana.

Cada linha abre um painel lateral de detalhe, sem retirar o usuário da lista. A paginação é obrigatória para manter resposta previsível quando há muitas R.Os.

### Entrada pela oportunidade

O detalhe da oportunidade terá a seção **R.Os vinculadas** e o botão **Nova R.O.**. Ele abre o mesmo formulário da tela geral, já com oportunidade e cliente preenchidos.

Na tela geral, o botão **Nova R.O.** inicia pela pesquisa de oportunidade. A seleção da oportunidade é obrigatória antes de fabricante, categoria e cenário. O formulário não oferece campo independente de cliente para não criar vínculo divergente.

### Detalhe e ações

O painel lateral mostra os fatos da R.O., seus ciclos de renovação, sucessão e eventos de auditoria. As ações seguem a situação atual:

| Situação | Ações disponíveis |
| --- | --- |
| Backoffice | editar dados iniciais, enviar para aprovação, encerrar/reprovar |
| Aguardando aprovação | aprovar, encerrar/reprovar |
| Aprovada | solicitar renovação, substituir, encerrar |
| Reprovada, Encerrada, Substituída | consulta de histórico |

O backend permanece como autoridade das transições; a interface apenas apresenta as ações permitidas e mostra o resultado confirmado.

## Fluxos

### Criar e aprovar

1. Usuário abre uma oportunidade existente ou pesquisa a oportunidade na tela geral.
2. Informa fabricante, categoria e cenário.
3. A R.O. é criada em `Backoffice`.
4. Fabio registra a aprovação com número, data de aprovação e data de vencimento confirmados.
5. O backend muda a R.O. para `Aprovada` e grava evento de auditoria.

### Renovar e substituir

1. A partir de uma R.O. aprovada, o usuário registra a solicitação de renovação.
2. Quando houver resposta, registra aprovação com novo vencimento ou negativa com motivo.
3. Em aprovação, o número permanece o mesmo e o ciclo é acrescentado ao histórico.
4. Quando a política do fabricante exigir novo registro, o usuário seleciona **Substituir R.O.**, informa o novo número e o vencimento confirmado.
5. O backend cria a sucessora no mesmo negócio e marca a anterior como `Substituída`.

## Atualização mensal e ClickUp Brain

A tela geral terá a ação **Preparar atualização por fabricante**. Ela abre a lista filtrada pelo fabricante e evidencia, para cada R.O., a última atualização humana da oportunidade e a ausência de atualização no período escolhido.

A ferramenta MCP `consultar_status_ros` usa a mesma fonte. Ela retorna as R.Os operacionais, prazo, ciclo, oportunidade, evidências humanas, última atualização no período e alertas de cobertura. Comentários de agentes, sistema e autoria desconhecida são excluídos. Anexos e prints sem conteúdo extraído são identificados como não interpretados.

O Brain deve resumir apenas os fatos retornados; não deve inventar conteúdo de anexos, prazos, etapas ou próximos passos.

## Estados de erro e transparência

- A interface bloqueia submissão sem oportunidade, fabricante ou categoria.
- Aprovação exige número e vencimento confirmados.
- O backend bloqueia renovação pendente duplicada, ciclos acima do limite e substituição em outro negócio.
- Em falha de rede, a tela mantém os dados digitados, informa que a operação não foi confirmada e não atualiza a linha localmente como se tivesse salvo.
- Se a coleta de evidências falhar em uma oportunidade, a tabela continua exibindo as demais e destaca cobertura parcial naquele item.
- Cliente com pesquisa ambígua pede seleção explícita; nunca escolhe o primeiro resultado automaticamente.

## Limites desta entrega

Esta área não automatiza login ou escrita em portais de fabricantes, não lê o conteúdo de prints, não muda campos comerciais da oportunidade e não cria tarefas R.O. paralelas no ClickUp. A publicação depende da aplicação prévia das migrations de R.Os, do deploy das Edge Functions e da configuração de autores humanos/agentes.

## Validação

A implementação deve cobrir ao menos:

1. criação pela oportunidade e pela tela geral;
2. bloqueio de R.O. sem oportunidade;
3. aprovação com número e vencimento;
4. três ciclos Dell e bloqueio do quarto;
5. substituição no mesmo negócio e preservação do histórico;
6. mais de uma R.O. para a mesma oportunidade;
7. filtros, paginação, vencimento e ausência de atualização mensal;
8. atividade humana elegível, comentário de agente excluído e cobertura parcial;
9. falhas da API sem confirmação visual enganosa.
