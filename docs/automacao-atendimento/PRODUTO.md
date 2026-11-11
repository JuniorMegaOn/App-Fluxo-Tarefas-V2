# Produto: Fluxo

Quadro de tarefas no estilo Trello. Organiza o trabalho em quadros, listas e cartões, e tem uma área de atendimento onde cada pedido de suporte vira uma conversa.

## Como usar

Requisito: Node 22.13 ou mais novo.

1. Na raiz do projeto: `npm install`
2. Subir API e interface: `npm run dev`
3. Abrir a interface no endereço que o comando mostra (por padrão, `http://127.0.0.1:5173`).

Outros comandos: `npm test` (testes), `npm run build` (gera `dist/`).

## Telas

- `/`: página inicial, com link para abrir os quadros.
- `/quadro`: os quadros. Cada quadro tem listas, e cada lista tem cartões. Cartões podem ser criados, editados, arrastados entre listas e excluídos.
- Menu lateral, item **Atendimento**: lista de atendimentos à esquerda e a conversa à direita. Para abrir um atendimento, informe um título e, se quiser, uma descrição. A descrição vira a primeira mensagem. Depois, responda na caixa de texto embaixo. Um atendimento pode ser marcado como resolvido ou reaberto.

## Dados

- Banco SQLite local em `server/dados/app.sqlite`, criado na primeira execução. Para começar do zero, apague a pasta `server/dados/`.
- Dados de exemplo são criados só quando o banco nasce vazio.

## API (resumo)

- Quadros: `/api/boards`, `/api/boards/:id`, listas em `/api/boards/:id/lists` e `/api/lists/:id`, cartões em `/api/lists/:id/cards` e `/api/cards/:id`.
- Atendimento: `/api/tickets`, `/api/tickets/:id` e `/api/tickets/:id/messages`.
- `/api/saude`: verificação simples de que a API está de pé.
- Existem também rotas de cadastro, login e logout em `/api/auth/*`. A interface ainda não usa essas rotas.

## Limites conhecidos

- Não há login na interface. Os quadros e atendimentos são abertos sem sessão.
- A tabela de rotas do README não lista as rotas de atendimento, de autenticação nem `/api/saude`. Esta descrição vale mais que ela.
