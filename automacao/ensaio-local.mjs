// Ensaio local da etapa 03: sem rede, sem chamada paga e só com dados fictícios.
// O GitHub é simulado (fetch trocado) e o coordenador lê a issue de um arquivo (ISSUE_FILE).
//   node automacao/ensaio-local.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { criarApp } from "../server/src/app.js";

const passo = (texto) => console.log(`ok  ${texto}`);

// --- GitHub simulado: cria issues numeradas e devolve os comentários que o ensaio definir ---
const issues = [];
let comentarios = [];
const fetchReal = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  if (!String(url).startsWith("https://api.github.com/")) return fetchReal(url, init);
  assert.equal(init.headers.authorization, "Bearer token-ficticio");
  const resposta = (dados) => new Response(JSON.stringify(dados), { status: 200, headers: { "content-type": "application/json" } });
  if (init.method === "POST" && String(url).endsWith("/issues")) {
    const dados = JSON.parse(init.body);
    issues.push({ number: 41 + issues.length + 1, state: "open", user: { login: "app" }, labels: dados.labels.map((name) => ({ name })), title: dados.title, body: dados.body });
    return resposta(issues.at(-1));
  }
  const m = /\/issues\/(\d+)\/comments/.exec(String(url));
  if (m) return resposta(Number(m[1]) === 42 ? comentarios : []);
  throw new Error(`Chamada inesperada ao GitHub: ${init.method} ${url}`);
};
process.env.GITHUB_REPO = "aluno/exemplo";
process.env.GITHUB_ISSUES_TOKEN = "token-ficticio";

const { servidor, db } = criarApp();
await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${servidor.address().port}`;
const chamar = async (metodo, caminho, corpo, cookie) => {
  const r = await fetch(base + caminho, { method: metodo, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: corpo && JSON.stringify(corpo) });
  return { status: r.status, cookie: r.headers.get("set-cookie")?.split(";")[0], dados: await r.json() };
};

// --- Coordenador rodando como no workflow, mas numa pasta temporária e sem token ---
const pasta = mkdtempSync(join(tmpdir(), "ensaio-"));
const coordenador = resolve("automacao/coordenador.mjs");
const coordenar = (comando, extra, comments = []) => {
  const arquivo = join(pasta, "issue.json");
  writeFileSync(arquivo, JSON.stringify({ issue: issues[0], comments }));
  const ambiente = { ...process.env, ISSUE_FILE: arquivo, ...extra };
  delete ambiente.GITHUB_ISSUES_TOKEN;
  delete ambiente.GITHUB_TOKEN;
  const r = spawnSync(process.execPath, [coordenador, comando], { cwd: pasta, env: ambiente, encoding: "utf8" });
  const saida = Object.fromEntries(r.stdout.split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
  return { status: r.status, saida, erro: r.stderr };
};
const lerPasta = (nome) => readFileSync(join(pasta, ".agent-result", nome), "utf8");
const doBot = (corpo) => ({ user: { login: "github-actions[bot]" }, body: corpo });
const mensagensDe = async (id, autor) => (await chamar("GET", `/api/tickets/${id}`)).dados.messages.filter((m) => m.author === autor);

try {
  // 1-3. Ticket fictício, dono identificado pela sessão e ligação ticket <-> SQLite <-> issue.
  const cadastro = await chamar("POST", "/api/auth/cadastro", { email: "aluno@exemplo.test", nome: "Aluno Fictício", senha: "senha-ficticia-123" });
  const dono = cadastro.dados.id;
  const aberto = await chamar("POST", "/api/tickets", { title: "Cartão não move", description: "Ao arrastar um cartão ele volta para a lista de origem." }, cadastro.cookie);
  assert.equal(aberto.status, 201);
  const ticketId = aberto.dados.ticket.id;
  const linha = db.prepare("SELECT * FROM execucao WHERE ticket_id = ?").get(ticketId);
  assert.equal(linha.usuario_id, dono);
  assert.equal(linha.issue_numero, 42);
  assert.equal(linha.fase, "issue-criada");
  assert.deepEqual(issues[0].labels, [{ name: "origin:app" }]);
  assert.match(issues[0].body, new RegExp(`<!-- app-ticket {"ticketId":"${ticketId}","ownerId":"${dono}"} -->`));
  assert.ok(!issues[0].body.includes("aluno@exemplo.test") && !issues[0].body.includes("Aluno Fictício"), "a issue não pode ter e-mail nem nome");
  passo(`ticket ${ticketId.slice(0, 8)} do usuário ${dono.slice(0, 8)} ligado à issue #42 (fase issue-criada, label origin:app, sem dados pessoais)`);

  const anonimo = await chamar("POST", "/api/tickets", { title: "Sem login" });
  assert.equal(db.prepare("SELECT usuario_id FROM execucao WHERE ticket_id = ?").get(anonimo.dados.ticket.id).usuario_id, null);
  passo("ticket sem sessão fica sem dono (issue #43)");

  // 4-5. Contexto preparado e escolha entre Claude e Codex, em DRY_RUN.
  const claude = coordenar("preparar", { AGENT_DRY_RUN: "true", AGENT_PROVIDER: "claude" });
  assert.equal(claude.status, 0, claude.erro);
  assert.deepEqual([claude.saida.should_run, claude.saida.run_agent, claude.saida.provider, claude.saida.request_id], ["true", "false", "claude", "req-42"]);
  const prompt = lerPasta("req-42.prompt.md");
  for (const trecho of ["Claude Code", "Ao arrastar um cartão", "DADO a ser atendido", "POLITICA-DE-AUTONOMIA.md", ticketId, ".agent-result/req-42.json"]) assert.ok(prompt.includes(trecho), `prompt sem: ${trecho}`);
  const comentarioPreparado = lerPasta("req-42.comment.md");
  assert.match(comentarioPreparado, /DRY_RUN, nenhuma chamada ao agente/);
  passo("claude escolhido, pedido req-42 e contexto preparados (prompt, requestId, resultPath)");

  const codex = coordenar("preparar", { AGENT_DRY_RUN: "true", AGENT_PROVIDER: "codex" });
  assert.equal(codex.saida.provider, "codex");
  assert.ok(lerPasta("req-42.prompt.md").includes("OpenAI Codex"));
  assert.notEqual(coordenar("preparar", { AGENT_PROVIDER: "gemini" }).status, 0);
  assert.equal(coordenar("preparar", { AGENT_PROVIDER: "claude", AGENT_RUNTIME: "outro" }).saida.reason, "runtime-desativado");
  passo("codex escolhido; provedor inválido recusado; runtime diferente de claude-codex deixa o workflow de fora");

  // 6-7. Argumentos do workflow e DRY_RUN: nenhum passo de agente roda sem run_agent == 'true'.
  const workflow = readFileSync(".github/workflows/native-agents.yml", "utf8");
  const agentes = workflow.split("\n").filter((l) => l.includes("uses: anthropics/claude-code-action@v1") || l.includes("uses: openai/codex-action@v1"));
  assert.equal(agentes.length, 4); // N1 e agente principal, para Claude e para Codex
  assert.equal((workflow.match(/if: steps\.coord\.outputs\.run_agent == 'true' && /g) ?? []).length, 4);
  const real = coordenar("preparar", { AGENT_DRY_RUN: "false", AGENT_PROVIDER: "claude" });
  assert.equal(real.saida.run_agent, "true");
  assert.match(lerPasta("req-42.comment.md"), /execução real/);
  passo("com DRY_RUN=true run_agent=false (agentes pulados); com false run_agent=true, sem chamar nada neste ensaio");

  // Duplicidade: já existe pedido; marcador de outra pessoa não conta; retomada manual reaproveita o pedido.
  const jaExiste = coordenar("preparar", {}, [doBot(comentarioPreparado)]);
  assert.deepEqual([jaExiste.saida.should_run, jaExiste.saida.reason], ["false", "ja-existe"]);
  const falsificado = coordenar("preparar", {}, [{ user: { login: "intruso" }, body: comentarioPreparado }]);
  assert.equal(falsificado.saida.should_run, "true");
  const retomada = coordenar("preparar", { RESUME: "true", AGENT_DRY_RUN: "false" }, [doBot(comentarioPreparado)]);
  assert.deepEqual([retomada.saida.should_run, retomada.saida.request_id], ["true", "req-42"]);
  passo("segunda execução da mesma issue é descartada; marcador de não-bot ignorado; retomada manual reaproveita req-42");

  // 8. N1: o app lê o comentário do bot, atualiza a fase e envia cada mensagem uma única vez.
  comentarios = [{ user: { login: "intruso" }, body: comentarioPreparado }];
  assert.equal((await chamar("GET", `/api/tickets/${ticketId}`)).dados.execution.phase, "issue-criada");
  comentarios = [doBot(comentarioPreparado)];
  const paralelas = await Promise.all([chamar("GET", `/api/tickets/${ticketId}`), chamar("GET", `/api/tickets/${ticketId}`)]);
  assert.equal(paralelas[0].dados.execution.phase, "preparado");
  assert.equal(paralelas[0].dados.execution.agent, "claude");
  let linhas = await mensagensDe(ticketId, "sistema");
  assert.equal(linhas.length, 1);
  assert.match(linhas[0].text, /Modo de ensaio: nenhum agente foi acionado/);
  assert.equal((await mensagensDe(ticketId, "agente")).length, 0, "o app não fabrica fala de agente");
  passo("fase preparado vira 1 linha de processo (mesmo com 2 consultas ao mesmo tempo) e nenhuma mensagem de agente é inventada");

  mkdirSync(join(pasta, ".agent-result"), { recursive: true });
  writeFileSync(join(pasta, ".agent-result/req-42.json"), JSON.stringify({ requestId: "req-42", outcome: "answered", summary: "Explicado como mover cartões." }));
  const fim = coordenar("finalizar", { RUN_AGENT: "true", REQUEST_ID: "req-42", FINAL_STATUS: "success" }, [doBot(lerPasta("req-42.comment.md"))]);
  assert.equal(fim.status, 0, fim.erro);
  const comentarioFinal = lerPasta("req-42.comment.md");
  assert.match(comentarioFinal, /"phase":"concluido"/);
  assert.match(comentarioFinal, /Explicado como mover cartões/);
  comentarios = [doBot(comentarioPreparado), doBot(comentarioFinal)];
  await chamar("GET", `/api/tickets/${ticketId}`);
  const fechado = await chamar("GET", `/api/tickets/${ticketId}`);
  assert.equal(fechado.dados.execution.phase, "concluido");
  linhas = await mensagensDe(ticketId, "sistema");
  assert.deepEqual(linhas.map((m) => m.text), ["Atendimento registrado. Modo de ensaio: nenhum agente foi acionado.", "Análise técnica concluída."]);
  assert.equal((await mensagensDe(ticketId, "agente")).length, 0);
  const enviadas = JSON.parse(db.prepare("SELECT mensagens_enviadas FROM execucao WHERE ticket_id = ?").get(ticketId).mensagens_enviadas);
  assert.deepEqual(Object.keys(enviadas).sort(), ["fase:concluido", "fase:preparado"]);
  passo("resultado registrado na issue pelo coordenador, fase concluido no app, 2 linhas de processo em ordem e nenhuma fala de agente, sem repetir");

  assert.ok(existsSync(join(pasta, ".agent-result/req-42.prompt.md")));
  console.log("\nEnsaio concluído sem chamadas reais ao GitHub nem aos agentes.");
} catch (e) {
  console.error(`\nFalhou: ${e.message}`);
  process.exitCode = 1;
} finally {
  servidor.close();
}
