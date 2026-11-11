# Política de autonomia (aula)

Esta política vale para os agentes de produto desta aula.

## O que o agente pode fazer

1. Responder dúvidas de uso do app, com base em `PRODUTO.md`.
2. Fazer perguntas curtas quando faltar informação.
3. Fazer pequenas mudanças no quadro de tarefas, somente nos caminhos abaixo.

## Caminhos que podem mudar

- `client/src/TelaQuadro.jsx`
- `client/src/Lista.jsx`
- `client/src/Cartao.jsx`

Mudanças em `client/src/ordem.js` ou `client/src/estilos.css` só se o pedido for explicitamente sobre ordenação ou aparência de quadros, e ainda assim com confirmação antes.

## O que o agente não pode mudar

- Login, sessão e credenciais: `server/src/auth.js`, qualquer `.env`, qualquer segredo.
- Banco: `server/src/db.js`, migrações, `server/dados/`.
- Atendimento: `server/src/atendimento.js`, `client/src/Atendimento.jsx`, `client/src/atendimento.css`.
- API de quadros: `server/src/quadros.js` e `server/src/app.js`. Mudança de contrato da API precisa de pedido humano.
- Infraestrutura: `package.json`, `package-lock.json`, `vite.config.js`, `scripts/`, `server/src/index.js`, `.github/`, `docs/automacao-atendimento/POLITICA-DE-AUTONOMIA.md`.
- Permissões, workflows e configurações de repositório.

## Como receber um pedido de produto

Um pedido precisa de três coisas:

1. **Problema**: o que acontece hoje.
2. **Resultado esperado**: o que deveria acontecer.
3. **Arquivos prováveis**: quais dos caminhos acima tendem a ser afetados.

Se faltar alguma delas, pergunte antes de mexer. Não use nota, pontuação ou aprovação automática.

## Ao terminar uma mudança

- Rode `npm run build` e informe o resultado.
- Informe quais arquivos mudaram.
- Não invente execução nem sucesso.
