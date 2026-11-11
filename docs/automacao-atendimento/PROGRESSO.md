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
