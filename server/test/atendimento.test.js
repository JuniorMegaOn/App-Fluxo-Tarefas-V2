import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { criarApp } from "../src/app.js";

let base, servidor, db;
const chamar = async (metodo, caminho, corpo) => {
  const r = await fetch(base + caminho, { method: metodo, headers: { "content-type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, dados: r.status === 204 ? null : await r.json() };
};

before(async () => {
  ({ servidor, db } = criarApp());
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(() => servidor.close());

test("abrir ticket com título e descrição cria a conversa com a descrição como primeira mensagem", async () => {
  const r = await chamar("POST", "/api/tickets", { title: "Não consigo entrar", description: "Aparece erro 500 ao digitar a senha." });
  assert.equal(r.status, 201);
  assert.equal(r.dados.ticket.title, "Não consigo entrar");
  assert.equal(r.dados.ticket.status, "aberto");
  assert.equal(r.dados.messages.length, 1);
  assert.equal(r.dados.messages[0].author, "usuario");
  assert.equal(r.dados.messages[0].text, "Aparece erro 500 ao digitar a senha.");
});

test("abrir ticket sem descrição cria só o título, sem mensagem", async () => {
  const r = await chamar("POST", "/api/tickets", { title: "Só o assunto" });
  assert.equal(r.status, 201);
  assert.equal(r.dados.ticket.title, "Só o assunto");
  assert.equal(r.dados.messages.length, 0);
});

test("ticket sem título, com título vazio ou título longo demais é recusado", async () => {
  assert.equal((await chamar("POST", "/api/tickets", {})).status, 400);
  assert.equal((await chamar("POST", "/api/tickets", { title: "   " })).status, 400);
  assert.equal((await chamar("POST", "/api/tickets", { title: "x".repeat(121) })).status, 400);
});

test("descrição vazia não gera mensagem; descrição muito longa é recusada", async () => {
  const vazia = await chamar("POST", "/api/tickets", { title: "Com descrição vazia", description: "   " });
  assert.equal(vazia.status, 201);
  assert.equal(vazia.dados.messages.length, 0);
  assert.equal((await chamar("POST", "/api/tickets", { title: "Longa", description: "x".repeat(5001) })).status, 400);
});

test("listagem traz os tickets do mais recente para o mais antigo", async () => {
  const antigo = (await chamar("POST", "/api/tickets", { title: "Primeiro pedido" })).dados.ticket;
  const novo = (await chamar("POST", "/api/tickets", { title: "Segundo pedido" })).dados.ticket;
  const { tickets } = (await chamar("GET", "/api/tickets")).dados;
  assert.ok(tickets.findIndex((t) => t.id === novo.id) < tickets.findIndex((t) => t.id === antigo.id));
});

test("responder adiciona mensagem do usuário na ordem e atualiza o ticket", async () => {
  const { ticket } = (await chamar("POST", "/api/tickets", { title: "Pergunta inicial", description: "Pergunta inicial" })).dados;
  const r = await chamar("POST", `/api/tickets/${ticket.id}/messages`, { text: "Segunda mensagem" });
  assert.equal(r.status, 201);
  assert.equal(r.dados.message.author, "usuario");
  const detalhe = (await chamar("GET", `/api/tickets/${ticket.id}`)).dados;
  assert.deepEqual(detalhe.messages.map((m) => m.text), ["Pergunta inicial", "Segunda mensagem"]);
});

test("ticket inexistente devolve 404", async () => {
  assert.equal((await chamar("GET", "/api/tickets/nao-existe")).status, 404);
  assert.equal((await chamar("POST", "/api/tickets/nao-existe/messages", { text: "oi" })).status, 404);
});

test("resolver registra mensagem do sistema; mensagem do usuário reabre o ticket", async () => {
  const { ticket } = (await chamar("POST", "/api/tickets", { title: "Problema resolvido depois", description: "Detalhes" })).dados;
  const resolvido = await chamar("PATCH", `/api/tickets/${ticket.id}`, { status: "resolvido" });
  assert.equal(resolvido.dados.ticket.status, "resolvido");
  let detalhe = (await chamar("GET", `/api/tickets/${ticket.id}`)).dados;
  assert.equal(detalhe.messages.at(-1).author, "sistema");

  await chamar("POST", `/api/tickets/${ticket.id}/messages`, { text: "Voltou a acontecer" });
  detalhe = (await chamar("GET", `/api/tickets/${ticket.id}`)).dados;
  assert.equal(detalhe.ticket.status, "aberto");
});

test("status inválido é recusado e repetir o mesmo status não gera mensagem extra", async () => {
  const { ticket } = (await chamar("POST", "/api/tickets", { title: "Status repetido", description: "Detalhes" })).dados;
  assert.equal((await chamar("PATCH", `/api/tickets/${ticket.id}`, { status: "qualquer" })).status, 400);
  await chamar("PATCH", `/api/tickets/${ticket.id}`, { status: "aberto" });
  const detalhe = (await chamar("GET", `/api/tickets/${ticket.id}`)).dados;
  assert.equal(detalhe.messages.length, 1);
});

test("agentes gravam mensagens pelo mesmo ponto de entrada, com autor 'agente'", async () => {
  const { registrarMensagem } = await import("../src/atendimento.js");
  const { ticket } = (await chamar("POST", "/api/tickets", { title: "Quero ajuda", description: "Preciso de ajuda" })).dados;
  registrarMensagem(db, ticket.id, "agente", "Já estou olhando isso.");
  const detalhe = (await chamar("GET", `/api/tickets/${ticket.id}`)).dados;
  assert.equal(detalhe.messages.at(-1).author, "agente");
  assert.equal(detalhe.messages.at(-1).text, "Já estou olhando isso.");
});
