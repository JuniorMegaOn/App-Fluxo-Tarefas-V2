# Progresso — Automação do atendimento

## Etapa 00 — Preparar o projeto e o acesso

**Cópias do projeto**
- Original do professor (somente leitura nesta aula): https://github.com/bittencourtthulio/App-Fluxo-Tarefas-V1
- Minha cópia (usada na aula): https://github.com/JuniorMegaOn/App-Fluxo-Tarefas-V2 (remoto local `novo`)
- Remoto `origin` continua apontando para o original. Nada foi reconfigurado nesta etapa.

**Ambiente**
- Node v26.12.1 e npm 11.20.0 (o `package.json` pede Node >= 22.13.0).
- `npm install` executado; sem alterações em arquivos versionados.
- Aviso do npm: o `esbuild` tem script de instalação ainda não aprovado. Não foi aprovado nem alterado.

**Como abrir o app**
- Desenvolvimento: `npm run dev` (script `scripts/dev.mjs`).
- Apenas o servidor da API: `npm start` (porta padrão 3001, ou `API_PORT`/`PORT`).
- Na execução de verificação, `npm start` falhou com `EADDRINUSE` na porta 3001: já havia um servidor rodando com dados locais. Ele respondeu `HTTP 200` em `/api/tickets`. Esse processo não foi encerrado.

**Build**
- Comando: `npm run build` (`vite build`).
- Resultado: passou (46 módulos transformados; `dist/` gerado e ignorado pelo Git).

**Acesso ao GitHub**
- Logado no GitHub CLI como `JuniorMegaOn`.
- Ações habilitadas na minha cópia (`allowed_actions: all`).
- No original, a conta tem só permissão de leitura (`viewerPermission: READ`), então não há como configurar nada lá.
- Pendência: não consegui confirmar pela API o plano do GitHub Copilot cloud agent (os endpoints de Copilot retornaram 404). Confirmar manualmente nas configurações da conta.
- Pendência: o secret `COPILOT_AGENT_TOKEN` ainda não foi criado. Ele será configurado em etapa própria. Nenhum valor de credencial foi exibido ou gravado.
- Pendência: `.github/agents/` ainda não existe.

**Dados locais**
- Nenhum arquivo `.env` foi lido, criado ou alterado. Nenhum banco SQLite foi apagado.
- Ticket de teste não foi aberto nesta etapa.

## Etapa 03 — App, issue e coordenador com Claude Code e Codex

**Fluxo**
1. O cliente abre o ticket no app. O backend cria a issue com a label `origin:app` e grava em `execucao` (SQLite) o ticket, o número da issue, o dono (da sessão, se houver login), o agente, `requestId`, `resultPath`, o PR e a fase.
2. A issue nova dispara `.github/workflows/native-agents.yml`, que roda `automacao/coordenador.mjs preparar`: confere a label, lê o ticket da issue, escolhe `claude` ou `codex` (`AGENT_PROVIDER`) e monta o pedido em `.agent-result/`. O resumo técnico interno vai num comentário da própria issue, com um marcador.
3. Com `AGENT_DRY_RUN=false`, o workflow chama a ação oficial do agente escolhido (um só). Com `true` (padrão), nenhum agente é chamado.
4. O Actions não alcança o SQLite local. Por isso o app lê o comentário do bot do Actions na issue quando o ticket é aberto na tela, atualiza a fase e envia a mensagem do N1 uma única vez.
5. Retomada manual: `workflow_dispatch` com `issue_number` e `resume`.

**Configuração**
- Variáveis do repositório (opcionais; sem elas valem os padrões): `AGENT_RUNTIME=claude-codex`, `AGENT_PROVIDER=claude`, `AGENT_DRY_RUN=true`.
- Secrets, só para `AGENT_DRY_RUN=false`: `ANTHROPIC_API_KEY` (Claude) e `OPENAI_API_KEY` (Codex). `GITHUB_TOKEN` vem do próprio Actions.
- Backend local, para criar a issue: `GITHUB_REPO=dono/repo` e `GITHUB_ISSUES_TOKEN` (token com permissão de issues). Sem eles o ticket funciona, sem issue.

**Ensaio local:** `node automacao/ensaio-local.mjs` (sem rede e sem chamada paga).

**Limites desta versão**
- Claude: a ação documentada empurra uma branch e dá o link do PR; não abre o PR sozinha. As docs consultadas não confirmam o uso em `workflow_dispatch`.
- Codex: edita o workspace e grava o resultado; commit e PR não estão implementados.
- Nenhuma chamada real a Claude, Codex ou à API do GitHub foi feita. O workflow nunca rodou no GitHub.
- Os tickets ainda não são filtrados por dono: o dono é só gravado.
- As ações usam as tags `@v1`, sem fixar por SHA.

**Ensaio real no GitHub (DRY_RUN, sem agente e sem API key)**
- Variáveis do V2 definidas: `AGENT_RUNTIME=claude-codex`, `AGENT_PROVIDER=claude`, `AGENT_DRY_RUN=true`. Label `origin:app` criada. Nenhum secret criado.
- Ticket fictício aberto pelo app (instância local com banco separado) gerou a issue #1 com a label `origin:app`.
- O workflow disparou duas vezes (`opened` e `labeled`): uma preparou o pedido `req-1` e comentou na issue; a outra foi descartada como `ja-existe`. Ambas terminaram com sucesso.
- Ao abrir o ticket de novo no app, a fase virou `preparado` e o N1 enviou uma única mensagem, mesmo em consultas repetidas.

**Revisão independente (subagente) e correções**
- Corrigido: `falhou` deixou de ser fase final no app (a retomada parte dela); retomada aceita também `executando`; PR é casado por branch `agente/issue-N` exata ou `#N` sem casar `#N0`; prompt não pede mais branch/PR que as ferramentas liberadas não permitem; chamadas ao GitHub têm timeout.
- Não corrigido: comentários da issue lidos só até 100 (sem paginação); ticket em `criando-issue` ou `erro-issue` não é reenviado depois.
- Antes de `AGENT_DRY_RUN=false`: instalar o app do GitHub do Claude no repositório e confirmar o input `permission-profile` do Codex.
