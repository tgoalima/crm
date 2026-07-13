# Resumo do Projeto: SPA Gestão Comercial Suprimatica

Este documento serve como um guia de handover detalhando tudo o que foi implementado, corrigido e testado na aplicação, permitindo que outro agente retome o desenvolvimento com clareza e sem perda de contexto.

---

## 1. Visão Geral do Projeto
A aplicação é uma **Single Page Application (SPA)** de Gestão Comercial desenvolvida para a Suprimatica. Ela atua como um editor de propostas comerciais versionáveis, integrado de forma bidirecional com o **Supabase** (banco de dados e backend) e o **ClickUp** (CRM e gestão de tarefas).

---

## 2. Arquitetura e Componentes

### A. Frontend (SPA)
*   **Tecnologias**: HTML5, Vanilla CSS, JavaScript (React injetado via CDN nativa).
*   **Layout**: Design responsivo com divisão visual de 80%/20%:
    *   **80% (Central)**: Editor de propostas, tabela de itens interativa com recálculos em tempo real e aba dedicada a **Relatórios (Dashboard)** de vendas.
    *   **20% (Lateral)**: Linha do tempo vertical mostrando o histórico de versões da proposta para a tarefa correspondente.
*   **Servidor Local**: Um servidor HTTP simples escrito em Python (`server.py`) que roda na porta `8080` e serve os arquivos estáticos.

### B. Banco de Dados (Supabase / PostgreSQL)
*   **Tabelas Principais**:
    *   `produtos`: Armazena os SKUs e preços/custos de referência.
    *   `propostas`: Armazena a capa da proposta, situação (`'Rascunho'`, `'Selecionada'`, `'Ganho'`, `'Substituída'`), versão (ex: `vA`, `vB`) e o ID da tarefa correspondente no ClickUp.
    *   `itens_proposta`: Itens específicos contidos em cada versão de proposta.
*   **Triggers PostgreSQL**:
    *   `recalculate_total_proposta`: Recalcula automaticamente a coluna `total_proposta` na tabela de propostas quando itens são inseridos, editados ou removidos.
    *   `auto_deselect_other_proposals`: Desmarca automaticamente outras propostas concorrentes associadas à mesma tarefa no ClickUp quando uma nova proposta é marcada como `'Selecionada'`.
*   **Funções SQL / RPC**:
    *   `gerar_nova_versao`: Executa a clonagem atômica de uma proposta e de seus itens associados para criar uma nova versão incremental (ex: `vA` -> `vB`), mudando a situação da versão anterior para `'Substituída'`.
    *   `increment_version_code`: Controla a lógica de letras das versões (suporta de `vA` até `vZ` e incrementa para `vAA` se necessário).

### C. Integração com API do ClickUp
*   Sincronização reativa acionada ao salvar, selecionar ou marcar uma proposta como ganha.
*   **Sincronização Dupla**:
    *   **Local**: Atualiza o custom field da tarefa de proposta local (procurando dinamicamente por nomes como "Total da Proposta", "Valor", etc.).
    *   **Global**: Atualiza o custom field "Deal Value" global na tarefa pai (Negócio), caso exista um relacionamento ativo do tipo `list_relationship` no card de proposta.
*   **Token / API Key**: Utiliza a chave estática `pk_90848927_3RNB3KVYA0ZBY9YILUOJAH7RUKD61437`.
*   **ID do Campo Global**: A constante `DEAL_VALUE_FIELD_ID` está fixada como `'ee65221a-029d-4d0a-a981-b71b5a29b4b4'`.

---

## 3. Principais Funcionalidades Entregues

1.  **Editor de Itens com Cálculo em Tempo Real**: Edição de quantidade e preço unitário dos itens com recálculo instantâneo na tela antes de submeter ao banco de dados.
2.  **Modo de Apenas Leitura (Read-Only)**: O editor é bloqueado para edição se a versão selecionada for antiga (`'Substituída'`) ou não for a selecionada ativa, impedindo modificações acidentais em históricos.
3.  **Fluxo de "🏆 Marcar como Ganha"**:
    *   Muda a situação da proposta no Supabase para `'Ganho'`.
    *   Muda o status do card de tarefa correspondente no ClickUp para `'ganho'`.
    *   Atualiza o Deal Value no ClickUp para o valor da proposta.
4.  **Dashboard de Relatórios**: Painel interativo com KPIs de faturamento ganho, ticket médio, gráficos de pizza por cenário de projeto, ranking de performance de vendedores e listagem de contratos fechados recentes.
5.  **Busca de Tarefas Resiliente**: Busca no ClickUp com parâmetros `include_closed=true`, paginação automática sequencial (`page=0, 1, 2...`) e suporte à resolução de relacionamentos pai/filho.

---

## 4. Histórico de Depuração e Correções Recentes

*   **Shadowing do Supabase**: Corrigido um bug de inicialização onde uma variável de estado React `supabase` (inicializada como `null`) ocultava a instância global carregada via CDN. A variável de estado foi renomeada para `supabaseClient` em todo o código.
*   **Erro FIELD_115 (Mapeamento de Custom Fields)**: Resolvido limpando o ID da tarefa (removendo prefixos como `#` e espaços) e implementando mapeamento dinâmico case-insensitive para os campos do ClickUp com base em variações de nomes em inglês e português.
*   **Erro FIELD_013 e Escala de Moeda (Money)**:
    *   A API do ClickUp para campos monetários rejeita objetos complexos. O payload foi simplificado para enviar apenas o número inteiro.
    *   A API exige o valor **em centavos** (multiplicado por 100). Exemplo: para salvar um valor de R$ 18.000,00, a API deve receber o valor inteiro `1800000`.
    *   Garantimos que o valor limpo nominal (`valorLimpo`, ex: `18000`) é multiplicado por 100 **exclusivamente uma única vez** através de:
        ```javascript
        const valorEmCentavos = Math.round(Number(valorLimpo) * 100);
        ```
    *   Isso resolveu o problema de exibição onde os valores apareciam inflados em 100 vezes na interface gráfica do ClickUp.
*   **Remoção de Versão no ClickUp**: O envio de atualizações para o campo "Nº da Proposta/Versão" no ClickUp foi desativado a pedido para simplificar e estabilizar a integração focando apenas no valor financeiro ("Deal Value").

---

## 5. Como Rodar e Testar o Projeto

1.  **Executar o Servidor Local**:
    No terminal, execute o comando:
    ```bash
    python server.py
    ```
    Isso iniciará o servidor ouvindo em `http://127.0.0.1:8080`.

2.  **Abrir no Navegador com Contexto de Tarefa**:
    Acesse a aplicação passando um ID de tarefa válido do ClickUp como parâmetro na URL:
    `http://127.0.0.1:8080/?task_id=86ahby7wm`

3.  **Script de Validação de Sintaxe**:
    Antes de realizar qualquer deploy, valide a integridade do código JavaScript usando o script utilitário de balanceamento de chaves:
    ```bash
    python C:\Users\Thiago Lima\.gemini\antigravity\brain\4da4e5ee-9fb6-47aa-8d1a-470b34e20f3a\scratch\check_js_braces_improved.py
    ```

---

## 6. Arquivos Relevantes do Projeto

*   [app.js](file:///c:/Users/Thiago%20Lima/Downloads/Antigravity/Suprimatica/SPA%20Gestão%20Comercial%20Suprimatica/app.js): Contém toda a lógica do React e a integração com ClickUp/Supabase.
*   [index.html](file:///c:/Users/Thiago%20Lima/Downloads/Antigravity/Suprimatica/SPA%20Gestão%20Comercial%20Suprimatica/index.html): Estrutura HTML e carregamento de CDNs.
*   [styles.css](file:///c:/Users/Thiago%20Lima/Downloads/Antigravity/Suprimatica/SPA%20Gestão%20Comercial%20Suprimatica/styles.css): Folha de estilos vanilla CSS da SPA.
*   [server.py](file:///c:/Users/Thiago%20Lima/Downloads/Antigravity/Suprimatica/SPA%20Gestão%20Comercial%20Suprimatica/server.py): Script python para servir o frontend.
*   [task.md](file:///C:/Users/Thiago%20Lima/.gemini/antigravity/brain/4da4e5ee-9fb6-47aa-8d1a-470b34e20f3a/task.md): Histórico da lista de tarefas e progresso.
*   [walkthrough.md](file:///C:/Users/Thiago%20Lima/.gemini/antigravity/brain/4da4e5ee-9fb6-47aa-8d1a-470b34e20f3a/walkthrough.md): Passo a passo detalhado do histórico de implementações do projeto.
