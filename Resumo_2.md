# Resumo_2 — Handover Completo: SPA Gestão Comercial Suprimática

> **Propósito:** Este documento é o guia de handover atualizado para que qualquer IA possa retomar o desenvolvimento com contexto 100% alinhado. Ele documenta a arquitetura, todas as funcionalidades entregues até a **Versão 20.0 (v20.0)**, padrões visuais, comandos de build e regras de usabilidade.

---

## 1. O Que o Projeto É (Visão Executiva)

Uma **SPA (Single Page Application)** de CRM e Gestão Comercial para a empresa **Suprimática**, que integra:

- **ClickUp** como fonte de dados de negócios (deals/tarefas) via API REST
- **Supabase (PostgreSQL)** como banco de dados de propostas comerciais e catálogos
- **React 18 via CDN** como framework de UI (sem build tool no browser, sem framework pesado)
- **Tailwind CSS v4** como framework de estilos compilado

A aplicação roda localmente via servidor Python (`server.py`) na porta `8000` (ou `http://127.0.0.1:8000`) e serve dois arquivos compilados: `dist/app.js` e `dist/styles.css`.

---

## 2. Arquitetura Atual e Fluxo de Build

### ⚠️ REGRA DE OURO — O navegador NUNCA carrega `app.js` diretamente

O `index.html` aponta para `/dist/app.js?v=20.0`. Portanto:

> **Toda edição feita em `app.js` (fonte) DEVE ser recompilada com esbuild para `dist/app.js` e o CSS com Tailwind CLI, caso contrário o navegador não verá as alterações.**

**Comando de build JS + CSS (executar após qualquer alteração no código):**
```bash
npx tailwindcss -i styles.css -o dist/styles.css && npx esbuild app.js --bundle=false --outfile=dist/app.js --platform=browser --format=esm --loader:.js=jsx
```

**Validação de sintaxe JS no bundle (opcional mas recomendado):**
```bash
node -c dist/app.js
```

**Comando para rodar o servidor Python:**
```bash
python3 server.py
```

**URL de Acesso:**
```
http://localhost:8000  (ou http://127.0.0.1:8000)
```

### Estrutura de Arquivos Relevantes

```
/
├── app.js                  # Fonte principal (React + JSX). EDITAR AQUI (~6.720 linhas).
├── dist/
│   ├── app.js              # Arquivo COMPILADO (~284kb). O que o navegador carrega.
│   └── styles.css          # Tailwind CSS compilado.
├── styles.css              # Fonte do Tailwind (input para compilação CSS).
├── index.html              # Carrega /dist/app.js?v=20.0 e /dist/styles.css.
├── server.py               # Servidor HTTP Python (porta 8000) + proxy ClickUp/Supabase.
├── .env                    # Variáveis de ambiente (SUPABASE_URL, etc).
├── package.json            # devDependencies do Tailwind CSS v4.
└── Resumo_2.md             # Este documento de handover técnico.
```

---

## 3. O Que o `server.py` Faz

O `server.py` atua como **Proxy Reverso Customizado**:

1. Serve os arquivos estáticos locais (HTML, JS, CSS).
2. Faz proxy de `/clickup-api/*` para `https://api.clickup.com/api/v2/*`, injetando o token de autenticação.
3. Faz proxy de `/api/*` para o Supabase, injetando as credenciais do `.env`.

- **Token ClickUp:** `pk_90848927_3RNB3KVYA0ZBY9YILUOJAH7RUKD61437`
- **ID da Lista Alvo (TARGET_LIST_ID):** `901326185457`
- **Campo de Valor do Negócio (DEAL_VALUE_FIELD_ID):** `ee65221a-029d-4d0a-a981-b71b5a29b4b4`

---

## 4. Funções Utilitárias Globais em `app.js`

| Função | Propósito |
|---|---|
| `getCleanBusinessName(raw)` | **Novo (v19.0/v20.0):** Limpa o nome do negócio removendo prefixos (`S/N \|`) e sufixos de versão (`- vA`, `- vvA`, `- vB`, `- versão A`), garantindo o nome exato do Negócio. |
| `getSafeStageName(card)` | Extrai `stage_name` ou `status` de um card de forma segura, mesmo se for retornado como objeto da API ClickUp. |
| `formatValueCompact(val)` | Formata valores em R$ com sufixo K/M. |
| `formatMaskedCurrency(val)`| Formata valor como moeda brasileira (pt-BR). |
| `getNextVersionLetter(v)` | Incrementa letras de versão (vA → vB → ... → vZ → vAA). |
| `getStageSortKey(name)` | Retorna índice de ordenação do estágio no funil. |

---

## 5. Histórico Recente de Evolução & Versões (v14.0 a v20.0)

### 🎨 v14.0 — Redesign Completo do Editor de Propostas
- Cards de versão com fundo limpo + `ring-2 ring-indigo-500` na versão selecionada.
- Barra lateral indicadora de 3px indigo no card ativo.
- Botões de ação com gradientes e feedback visual.
- Rodapé de total com tipografia `tabular-nums` e card gradiente.

### ⌨️ v15.0 — Redesign do Modal de Tarefas & Navegação por Teclado
- Redesign estilo Salesforce para o modal de criar tarefa (`showNewTaskModal`) em Light Mode ultra limpo.
- **Teclado ESC:** Listener global `useEffect` adicionado para fechar qualquer modal aberto (`showNewTaskModal`, `showSettingsModal`, `showProductModal`, `showCloseModal`, etc.) ao pressionar a tecla `Escape`.
- **Navegação por Setas no Catálogo:** No dropdown de produtos da proposta, navegação por teclas (`ArrowUp`, `ArrowDown`, `Enter`, `Tab`, `Escape`) para navegar e escolher produtos facilmente.

### 📋 v16.0 — Redesign Completo do Painel de Tarefas Comerciais
- **KPI Cards no topo:** *Pendentes*, *Vencidas* (destacado em vermelho com `animate-pulse`), *Para Hoje* (âmbar), *Concluídas*.
- **Agrupamento por Urgência:** Seções automáticas para 🔴 *Vencidas* (ponto piscante + barra rosa), 🟡 *Hoje* (barra âmbar + horário), 🔵 *Próximas* (azul) e ✅ *Concluídas* (visíveis ao alternar filtro).
- **Cards em vez de Tabela:** Cada tarefa é exibida em card moderno com badge do tipo (📞 Ligação, 🤝 Reunião, ✉️ E-mail, 🔄 Follow-up, 📍 Visita, 📄 Proposta), data relativa, avatar com iniciais do responsável e ações inline (Editar/Excluir) exibidas no hover.

### ⚙️ v17.0 & v18.0 — Correções no Modal de Configurações (Engrenagem)
- **v17.0 (Light Mode):** Corrigido texto invisível (`text-white` em fundo `bg-white`) no modal da engrenagem e modal de novo produto. Convertidos todos os títulos para `text-slate-900 font-extrabold`.
- **v18.0 (Bugfix Crítico):** Resolvido erro `ReferenceError: Can't find variable: importText` no Safari ao clicar na engrenagem. Declarado o estado `const [importText, setImportText] = useState('')` no componente raiz `App`.

### 🏷️ v19.0 & v20.0 — Ajuste no Negócio Associado da Tarefa & Visibilidade do Drawer
- **v19.0:** Criada a função `getCleanBusinessName(raw)` para eliminar duplicações como `vvA` ou sufixos de versão.
- **v20.0 (Correção no Drawer):**
  - **Título do Drawer (Foto 2):** Alterada a classe do nome do negócio de `text-white` (invisível em fundo branco) para `text-slate-900 font-extrabold text-[17px]`.
  - **Botão "+ Nova Tarefa Comercial":** O botão nas Ações do Negócio dentro do Drawer continha um handler inline antigo que forçava o nome da proposta com versão (`${propName} - v${versao}`). Ele foi atualizado para chamar `handleNewTaskClick()`, que prioriza `selectedTask.name`.
  - **Resultado:** A tarefa aberta a partir do negócio traz automaticamente o nome exato e limpo do Negócio (ex: **`Unimed São Carlos | Upgrade Switch Core Aruba`**), sem nenhuma versão ou caractere `vvA`.

---

## 6. Mapeamento de Modais e Atalhos do Teclado

| Modal | Estado | Atalho ESC | Estilo Visual |
|---|---|---|---|
| **Criar/Editar Tarefa** | `showNewTaskModal` | ✅ Ativo | Light Mode / Salesforce Style |
| **Configurações (Engrenagem)** | `showSettingsModal` | ✅ Ativo | Light Mode com menu lateral de abas |
| **Adicionar Produto** | `showProductModal` | ✅ Ativo | Light Mode compacto |
| **Fechamento (Ganho/Perdido)** | `showCloseModal` | ✅ Ativo | Light Mode com motivos de perda |
| **Drawer de Detalhes** | `showDrawer` | ✅ Ativo | Lateral direita com timeline e ações |

---

## 7. Esclarecimentos Sobre Alertas Comuns do Navegador

- **`Source Map 404 (chart.umd.min.js.map)` no Safari:**
  Aviso de desenvolvimento que ocorre ao abrir as Ferramentas do Desenvolvedor do Safari. É apenas o navegador tentando buscar o mapa de código original do Chart.js para depuração. **Não é um erro do sistema e não afeta nada no uso real.**

---

## 8. Como Testar e Continuar o Desenvolvimento

1. **Editar o código fonte:** Altere apenas o arquivo `app.js` (ou `styles.css`).
2. **Recompilar:**
   ```bash
   npx tailwindcss -i styles.css -o dist/styles.css && npx esbuild app.js --bundle=false --outfile=dist/app.js --platform=browser --format=esm --loader:.js=jsx
   ```
3. **Iniciar o Servidor Python:**
   ```bash
   python3 server.py
   ```
4. **Testar no navegador:** Acesse `http://localhost:8000` e pressione **Cmd + R** se necessário para renovar o cache (`?v=20.0`).
