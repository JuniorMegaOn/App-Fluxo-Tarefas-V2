// Área de atendimento: tickets de suporte. Cada ticket é uma conversa (mensagens em ordem).
// Todo texto novo entra por `registrarMensagem`, para qualquer autor: "usuario", "agente" ou "sistema".
// Os agentes autônomos vão responder chamando essa mesma função com autor "agente".
import { randomUUID } from "node:crypto";
import { invalido, naoEncontrado, texto } from "./http.js";
import { transacao } from "./db.js";

const STATUS = ["aberto", "resolvido"];
const AUTORES = ["usuario", "agente", "sistema"];
const TAMANHO_TITULO = 120;
const TAMANHO_DESCRICAO = 5000;

const saidaTicket = (t) => ({ id: t.id, title: t.titulo, status: t.status, createdAt: t.criado_em, updatedAt: t.atualizado_em });
const saidaMensagem = (m) => ({ id: m.id, ticketId: m.ticket_id, author: m.autor, text: m.texto, createdAt: m.criado_em });

/** Grava uma mensagem e atualiza o ticket. Uma mensagem do usuário reabre um ticket resolvido. */
export function registrarMensagem(db, ticketId, autor, conteudo) {
  if (!AUTORES.includes(autor)) throw new Error(`Autor de mensagem desconhecido: ${autor}`);
  const agora = new Date().toISOString();
  const mensagem = { id: randomUUID(), ticket_id: ticketId, autor, texto: conteudo, criado_em: agora };
  db.prepare("INSERT INTO mensagem_ticket (id, ticket_id, autor, texto, criado_em) VALUES (?, ?, ?, ?, ?)")
    .run(mensagem.id, mensagem.ticket_id, mensagem.autor, mensagem.texto, mensagem.criado_em);
  if (autor === "usuario") {
    db.prepare("UPDATE ticket SET atualizado_em = ?, status = 'aberto' WHERE id = ?").run(agora, ticketId);
  } else {
    db.prepare("UPDATE ticket SET atualizado_em = ? WHERE id = ?").run(agora, ticketId);
  }
  return mensagem;
}

export function rotasDeAtendimento(app, db) {
  const buscarTicket = (id) => {
    const t = db.prepare("SELECT * FROM ticket WHERE id = ?").get(id);
    if (!t) throw naoEncontrado("Ticket");
    return t;
  };
  const detalhe = (t) => ({
    ticket: saidaTicket(t),
    messages: db.prepare("SELECT * FROM mensagem_ticket WHERE ticket_id = ? ORDER BY criado_em, rowid").all(t.id).map(saidaMensagem),
  });

  app.get("/api/tickets", () => ({
    tickets: db.prepare("SELECT * FROM ticket ORDER BY atualizado_em DESC, rowid DESC").all().map(saidaTicket),
  }));

  // Abertura no formato de uma issue: título obrigatório e descrição opcional.
  // A descrição, se houver, vira a primeira mensagem da conversa.
  app.post("/api/tickets", ({ corpo }) => {
    const titulo = texto(corpo, "title", { max: TAMANHO_TITULO });
    const descricao = texto(corpo, "description", { max: TAMANHO_DESCRICAO, min: 0, opcional: true });
    const id = randomUUID();
    const agora = new Date().toISOString();
    return transacao(db, () => {
      db.prepare("INSERT INTO ticket (id, titulo, status, criado_em, atualizado_em) VALUES (?, ?, 'aberto', ?, ?)")
        .run(id, titulo, agora, agora);
      if (descricao) registrarMensagem(db, id, "usuario", descricao);
      return detalhe(buscarTicket(id));
    });
  });

  app.get("/api/tickets/:id", ({ params }) => detalhe(buscarTicket(params.id)));

  app.post("/api/tickets/:id/messages", ({ params, corpo }) => {
    const ticket = buscarTicket(params.id);
    const conteudo = texto(corpo, "text", { max: 5000 });
    return { message: saidaMensagem(transacao(db, () => registrarMensagem(db, ticket.id, "usuario", conteudo))) };
  });

  app.patch("/api/tickets/:id", ({ params, corpo }) => {
    const ticket = buscarTicket(params.id);
    if (!STATUS.includes(corpo.status)) throw invalido("status deve ser 'aberto' ou 'resolvido'.");
    if (corpo.status !== ticket.status) {
      transacao(db, () => {
        db.prepare("UPDATE ticket SET status = ?, atualizado_em = ? WHERE id = ?").run(corpo.status, new Date().toISOString(), ticket.id);
        registrarMensagem(db, ticket.id, "sistema", corpo.status === "resolvido" ? "Atendimento marcado como resolvido." : "Atendimento reaberto.");
      });
    }
    return { ticket: saidaTicket(buscarTicket(ticket.id)) };
  });
}
