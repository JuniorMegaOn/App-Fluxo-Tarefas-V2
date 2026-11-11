// Ensaio da etapa 05 (entrega e retomadas): sem rede, sem chamada paga e só com dados fictícios.
// Um GitHub simulado (servidor local) recebe as chamadas do coordenador e do app; o git usa um remoto local.
//   node automacao/ensaio-entrega.mjs
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { criarApp } from "../server/src/app.js";

const passo = (texto) => console.log(`ok  ${texto}`);
const coordenador = resolve("automacao/coordenador.mjs");

// --- GitHub simulado ---
const gh = { issues: [], comentarios: {}, prs: [], arquivos: {}, chamadas: [], mergeStatus: 200 };
const autor = (req) => (req.headers.authorization === "Bearer actions-token" ? "github-actions[bot]" : "JuniorMegaOn");
const github = createServer((req, res) => {
  let corpo = "";
  req.on("data", (d) => (corpo += d));
  req.on("end", () => {
    const url = new URL(req.url, "http://x");
    const caminho = url.pathname.replace("/repos/aluno/exemplo", "");
    gh.chamadas.push(`${req.method} ${caminho}`);
    const dados = corpo ? JSON.parse(corpo) : {};
    const responder = (status, objeto) => {
      res.writeHead(status, { "content-type": typeof objeto === "string" ? "text/plain" : "application/json" });
      res.end(typeof objeto === "string" ? objeto : JSON.stringify(objeto));
    };
    let m;
    if (req.method === "POST" && caminho === "/issues") {
      const issue = { number: gh.issues.length + 1, state: "open", title: dados.title, body: dados.body, user: { login: autor(req) }, labels: dados.labels.map((name) => ({ name })) };
      gh.issues.push(issue);
      return responder(201, issue);
    }
    if ((m = /^\/issues\/(\d+)$/.exec(caminho))) {
      const issue = gh.issues[m[1] - 1];
      if (req.method === "PATCH") Object.assign(issue, dados);
      return responder(200, issue);
    }
    if ((m = /^\/issues\/(\d+)\/comments$/.exec(caminho))) { // issues e PRs usam a mesma rota
      const lista = (gh.comentarios[m[1]] ??= []);
      if (req.method === "POST") { const c = { id: lista.length + 1, user: { login: autor(req) }, body: dados.body, created_at: new Date().toISOString() }; lista.push(c); return responder(201, c); }
      return responder(200, (url.searchParams.get("page") ?? "1") === "1" ? lista : []);
    }
    if ((m = /^\/git\/matching-refs\/heads\/(.+)$/.exec(caminho))) {
      return responder(200, gh.prs.map((p) => ({ ref: `refs/heads/${p.head.ref}` })).filter((r) => r.ref.startsWith(`refs/heads/${decodeURIComponent(m[1])}`)));
    }
    if (req.method === "GET" && caminho === "/pulls") {
      const head = url.searchParams.get("head")?.split(":")[1];
      return responder(200, gh.prs.filter((p) => (!head || p.head.ref === head) && (url.searchParams.get("state") === "all" || p.state === url.searchParams.get("state"))));
    }
    if (req.method === "POST" && caminho === "/pulls") {
      const pr = { number: 100 + gh.prs.length, state: "open", merged: false, title: dados.title, body: dados.body, head: { ref: dados.head, sha: `sha-${100 + gh.prs.length}` } };
      gh.prs.push(pr);
      return responder(201, pr);
    }
    if ((m = /^\/pulls\/(\d+)\/files$/.exec(caminho))) {
      return responder(200, (gh.arquivos[m[1]] ?? ["client/src/Cartao.jsx"]).map((filename) => ({ filename })));
    }
    if ((m = /^\/pulls\/(\d+)\/merge$/.exec(caminho))) {
      const pr = gh.prs[m[1] - 100];
      if (gh.mergeStatus !== 200) return responder(gh.mergeStatus, { message: "recusado pelas regras" });
      if (dados.sha !== pr.head.sha) return responder(409, { message: "sha diferente" });
      Object.assign(pr, { merged: true, state: "closed" });
      return responder(200, { merged: true });
    }
    if ((m = /^\/pulls\/(\d+)$/.exec(caminho))) {
      const pr = gh.prs[m[1] - 100];
      return String(req.headers.accept).includes("diff") ? responder(200, "diff --git a/client/src/Cartao.jsx b/client/src/Cartao.jsx\n+export const Cartao = 2;\n") : responder(200, pr);
    }
    return responder(404, { message: `rota não simulada: ${req.method} ${caminho}` });
  });
});
await new Promise((r) => github.listen(0, "127.0.0.1", r));
const apiFalsa = `http://127.0.0.1:${github.address().port}`;

// O app fala com a API pública do GitHub: aqui ela é redirecionada para o simulado.
const fetchReal = globalThis.fetch;
globalThis.fetch = (url, init) => fetchReal(String(url).replace("https://api.github.com", apiFalsa), init);
process.env.GITHUB_REPO = "aluno/exemplo";
process.env.GITHUB_ISSUES_TOKEN = "token-ficticio";

const { servidor, db } = criarApp();
await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${servidor.address().port}`;
const chamar = async (metodo, caminho, corpo) => {
  const r = await fetch(base + caminho, { method: metodo, headers: { "content-type": "application/json" }, body: corpo && JSON.stringify(corpo) });
  return { status: r.status, dados: await r.json() };
};

// --- Repositório git temporário com remoto local, e o coordenador rodando como no workflow ---
function repoLimpo() {
  const raiz = mkdtempSync(join(tmpdir(), "entrega-"));
  const dir = join(raiz, "repo");
  const remoto = join(raiz, "remoto.git");
  const git = (cwd, ...args) => { const r = spawnSync("git", args, { cwd, encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  mkdirSync(join(dir, "client/src"), { recursive: true });
  git(raiz, "init", "--bare", "-b", "main", remoto);
  git(dir, "init", "-b", "main");
  writeFileSync(join(dir, "client/src/Cartao.jsx"), "export const Cartao = 1;\n");
  writeFileSync(join(dir, ".gitignore"), ".agent-result/\n");
  git(dir, "add", "-A");
  git(dir, "-c", "user.name=Ensaio", "-c", "user.email=ensaio@exemplo.test", "commit", "-m", "base");
  return { dir, remoto, git };
}
const rodar = (repo, comando, extra = {}) => new Promise((resolver) => {
  const env = { ...process.env, GITHUB_API_URL: apiFalsa, GITHUB_REPOSITORY: "aluno/exemplo", GITHUB_TOKEN: "actions-token", GIT_REMOTE_URL: repo.remoto, ...extra };
  delete env.GITHUB_OUTPUT; delete env.GITHUB_ISSUES_TOKEN; delete env.GITHUB_REPO; delete env.ISSUE_FILE;
  const filho = spawn(process.execPath, [coordenador, comando], { cwd: repo.dir, env });
  let saida = "", erro = "";
  filho.stdout.on("data", (d) => (saida += d));
  filho.stderr.on("data", (d) => (erro += d));
  filho.on("close", (status) => resolver({
    status, erro, texto: saida,
    saida: Object.fromEntries(saida.split("\n").filter((l) => /^\w+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])),
  }));
});
const marcas = (numero, trecho) => (gh.comentarios[numero] ?? []).filter((c) => c.user.login === "github-actions[bot]" && c.body.includes(trecho));
const fase = (numero) => JSON.parse(/native-agents:request (\{.*?\}) -->/.exec(marcas(numero, "native-agents:request").at(-1).body)[1]).phase;

const novoTicket = async (titulo) => {
  const r = await chamar("POST", "/api/tickets", { title: titulo, description: "Dado fictício de ensaio." });
  return { ticketId: r.dados.ticket.id, n: r.dados.execution.issueNumber };
};
/** Do pedido do coordenador até a publicação, com o agente simulado gravando o resultado e (se for código) mexendo no arquivo. */
async function atender(n, repo, resultado) {
  const preparado = await rodar(repo, "preparar", { ISSUE_NUMBER: n, AGENT_DRY_RUN: "false", AGENT_PROVIDER: "claude" });
  assert.equal(preparado.saida.should_run, "true", preparado.erro);
  mkdirSync(join(repo.dir, ".agent-result"), { recursive: true });
  writeFileSync(join(repo.dir, `.agent-result/req-${n}.json`), JSON.stringify({ requestId: `req-${n}`, ...resultado }));
  if (resultado.outcome === "code") writeFileSync(join(repo.dir, "client/src/Cartao.jsx"), `export const Cartao = ${n + 1};\n`);
  const fim = await rodar(repo, "finalizar", { ISSUE_NUMBER: n, REQUEST_ID: `req-${n}`, RUN_AGENT: "true", FINAL_STATUS: "success" });
  assert.equal(fim.status, 0, fim.erro);
  return rodar(repo, "publicar", { ISSUE_NUMBER: n, PROVIDER: "claude" });
}
const revisar = async (repo, n, approved, summary = "ok") => {
  const rev = await rodar(repo, "preparar-revisao", { ISSUE_NUMBER: n });
  assert.equal(rev.status, 0, rev.erro);
  writeFileSync(join(repo.dir, `.agent-result/req-${n}.review.json`), JSON.stringify({ approved, summary }));
  return rev;
};
const entregar = (repo, n, extra) => rodar(repo, "entregar", { ISSUE_NUMBER: n, AGENT_DRY_RUN: "false", BUILD_RESULT: "success", BUILD_SHA: `sha-${100 + (n - 1)}`, AUTO_MERGE: "false", ...extra });
const mensagensDoAgente = async (ticketId) => (await chamar("GET", `/api/tickets/${ticketId}`)).dados.messages.filter((m) => m.author === "agente").map((m) => m.text);

try {
  // 1. Alteração de código: o coordenador abre o PR (sem fechar a issue) e, com AUTO_MERGE=false, o PR fica disponível.
  const A = await novoTicket("Ensaio A: mudança no cartão");
  const repoA = repoLimpo();
  const pub = await atender(A.n, repoA, { outcome: "code", summary: "ajuste no cartão" });
  assert.equal(pub.status, 0, pub.erro);
  assert.equal(pub.saida.pr_number, "100");
  assert.match(repoA.git(repoA.dir, "ls-remote", repoA.remoto, "claude/issue-1"), /refs\/heads\/claude\/issue-1/);
  assert.match(gh.prs[0].body, /Refs #1/);
  assert.ok(!/(close[sd]?|fix(e[sd])?|resolve[sd]?)\s+#/i.test(gh.prs[0].body), "o corpo do PR não pode fechar a issue");
  assert.equal(fase(A.n), "pr-aberto");
  const duplicado = await rodar(repoA, "preparar", { ISSUE_NUMBER: A.n, AGENT_DRY_RUN: "false", AGENT_PROVIDER: "claude" });
  assert.equal(duplicado.saida.reason, "ja-existe"); // uma execução por issue
  const repetido = await rodar(repoA, "publicar", { ISSUE_NUMBER: A.n, PROVIDER: "claude" });
  assert.equal(gh.prs.length, 1, "repetir a publicação não abre outro PR");
  assert.equal(repetido.status, 0, repetido.erro);
  passo("código: branch enviada, PR #100 aberto citando a issue (Refs, sem palavra que feche) e fase pr-aberto; repetir não duplica o PR");

  const ctx = await rodar(repoA, "contexto", { ISSUE_NUMBER: A.n });
  assert.deepEqual([ctx.saida.has_pr, ctx.saida.pr_number, ctx.saida.head_sha, ctx.saida.merged], ["true", "100", "sha-100", "false"]);
  await revisar(repoA, A.n, true);
  assert.ok(readFileSync(join(repoA.dir, ".agent-result/req-1.review.prompt.md"), "utf8").includes("req-1") && existsSync(join(repoA.dir, ".agent-result/req-1.diff")));
  const seco = await rodar(repoA, "entregar", { ISSUE_NUMBER: A.n, AGENT_DRY_RUN: "true" });
  assert.match(seco.texto, /DRY_RUN: entrega não executada/);
  assert.ok(!gh.chamadas.some((c) => c.startsWith("PUT ")));
  const manual = await entregar(repoA, A.n);
  assert.equal(manual.saida.result, "aguardando-merge", manual.erro);
  assert.ok(!gh.chamadas.some((c) => c.startsWith("PUT ")), "AUTO_MERGE=false não integra");
  assert.equal(gh.issues[0].state, "open");
  assert.equal(marcas(A.n, "native-agents:reply").length, 0);
  passo("AUTO_MERGE=false: build verde e revisão aprovada; PR fica aberto, sem merge, sem resposta e com a issue aberta; DRY_RUN não entrega");

  // 2. AUTO_MERGE=true: integra exatamente o commit conferido, responde pelo N1 e fecha a issue; retomar não duplica.
  const integrado = await entregar(repoA, A.n, { AUTO_MERGE: "true" });
  assert.equal(integrado.saida.result, "respondido", integrado.erro);
  assert.equal(gh.chamadas.filter((c) => c.startsWith("PUT ")).length, 1);
  assert.equal(gh.prs[0].merged, true);
  assert.equal(gh.issues[0].state, "closed");
  const resposta = marcas(A.n, "native-agents:reply");
  assert.equal(resposta.length, 1);
  assert.match(resposta[0].body, /O app local precisa ser atualizado/);
  assert.ok(!/já está atualizado|já foi atualizado/i.test(resposta[0].body));
  const retomada = await entregar(repoA, A.n, { AUTO_MERGE: "true", BUILD_RESULT: "failure" }); // falha pós-merge: só resposta e fechamento
  assert.equal(retomada.saida.result, "respondido");
  assert.equal(gh.chamadas.filter((c) => c.startsWith("PUT ")).length, 1, "não integra de novo");
  assert.equal(marcas(A.n, "native-agents:reply").length, 1, "não responde de novo");
  assert.equal(gh.chamadas.filter((c) => c === "PATCH /issues/1").length, 1, "não fecha de novo");
  assert.equal(fase(A.n), "respondido");
  passo("AUTO_MERGE=true: merge do commit conferido, resposta do N1 e issue fechada uma vez; retomada depois do merge não repete nada");

  // 3. O app volta a consultar e mostra a resposta no ticket do dono, uma única vez.
  await chamar("GET", `/api/tickets/${A.ticketId}`);
  const vistoA = await chamar("GET", `/api/tickets/${A.ticketId}`);
  assert.equal(vistoA.dados.execution.phase, "respondido");
  const textosA = await mensagensDoAgente(A.ticketId);
  assert.equal(textosA.filter((t) => t.includes("O app local precisa ser atualizado")).length, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM mensagem_ticket WHERE id = ?").get("reply-req-1-integrado").n, 1);
  passo("app: o ticket mostra a resposta do N1 (id estável reply-req-1-integrado) uma só vez, mesmo consultando de novo");

  // 4. Build, revisão e política falham: uma rodada de correção no MESMO PR; depois, pendência para o instrutor.
  const B = await novoTicket("Ensaio B: build quebra");
  const repoB = repoLimpo();
  await atender(B.n, repoB, { outcome: "code" });
  gh.arquivos[String(100 + (B.n - 1))] = ["client/src/Cartao.jsx", ".github/workflows/x.yml"];
  await revisar(repoB, B.n, false, "o cartão perde o título");
  const emitidasAntes = gh.issues.length;
  const falha1 = await entregar(repoB, B.n, { BUILD_RESULT: "failure", BUILD_SHA: `sha-${100 + (B.n - 1)}` });
  assert.equal(falha1.saida.fix, "true", falha1.erro);
  const pedidoFix = marcas(100 + (B.n - 1), "native-agents:fix");
  assert.equal(pedidoFix.length, 1);
  for (const trecho of ["build failure", "arquivos fora da política", "revisão: o cartão perde o título", "req-2"]) assert.ok(pedidoFix[0].body.includes(trecho), trecho);
  const corr = await rodar(repoB, "preparar-correcao", { ISSUE_NUMBER: B.n });
  assert.equal(corr.saida.branch, "claude/issue-2");
  const promptFix = readFileSync(join(repoB.dir, ".agent-result/req-2.fix.prompt.md"), "utf8");
  assert.ok(promptFix.includes("MESMO PR #101") && promptFix.includes("req-2") && promptFix.includes("única rodada"));
  const falha2 = await entregar(repoB, B.n, { BUILD_RESULT: "failure", BUILD_SHA: `sha-${100 + (B.n - 1)}` });
  assert.equal(falha2.saida.result, "pendente-instrutor", falha2.erro);
  assert.equal(marcas(100 + (B.n - 1), "native-agents:fix").length, 1, "só uma rodada automática");
  assert.equal(fase(B.n), "pendente-instrutor");
  assert.equal(gh.issues.length, emitidasAntes, "nenhuma issue nova");
  assert.equal(gh.prs.length, 2, "nenhum PR novo");
  assert.equal(gh.prs[1].merged, false);
  passo("falha: 1 pedido de correção no mesmo PR (erro curto + requestId), 2ª falha vira pendente-instrutor; sem novo ticket, issue ou PR");

  // 5. Regras da branch recusam o merge: sem bypass, o PR fica aberto.
  const C = await novoTicket("Ensaio C: merge recusado");
  const repoC = repoLimpo();
  await atender(C.n, repoC, { outcome: "code" });
  await revisar(repoC, C.n, true);
  gh.mergeStatus = 405;
  const recusado = await entregar(repoC, C.n, { AUTO_MERGE: "true", BUILD_SHA: `sha-${100 + (C.n - 1)}` });
  gh.mergeStatus = 200;
  assert.equal(recusado.saida.result, "merge-recusado", recusado.erro);
  assert.equal(gh.prs[2].merged, false);
  assert.equal(gh.issues[C.n - 1].state, "open");
  assert.equal(marcas(C.n, "native-agents:reply").length, 0);
  passo("merge recusado pelas regras: PR continua aberto, issue aberta e nenhuma resposta enviada");

  // 6. Sem código: dúvida de uso é respondida e fecha; esclarecimento pendente mantém o caso aberto.
  const D = await novoTicket("Ensaio D: dúvida de uso");
  const repoD = repoLimpo();
  const respondido = await atender(D.n, repoD, { outcome: "answered", publicText: "Para mover um cartão, arraste-o pelo ícone de alça até a outra lista." });
  assert.equal(respondido.saida.pr_number, "");
  await rodar(repoD, "publicar", { ISSUE_NUMBER: D.n, PROVIDER: "claude" });
  assert.equal(marcas(D.n, "reply-req-4-respondido").length, 1);
  assert.equal(gh.issues[D.n - 1].state, "closed");
  const E = await novoTicket("Ensaio E: falta informação");
  const repoE = repoLimpo();
  await atender(E.n, repoE, { outcome: "waiting-customer", publicText: "Em qual navegador isso acontece?" });
  assert.equal(marcas(E.n, "reply-req-5-pergunta").length, 1);
  assert.equal(gh.issues[E.n - 1].state, "open");
  assert.equal(fase(E.n), "aguardando-cliente");
  assert.equal(gh.prs.length, 3, "sem código não abre PR");
  await chamar("GET", `/api/tickets/${E.ticketId}`);
  assert.deepEqual((await mensagensDoAgente(E.ticketId)).filter((t) => t.includes("navegador")), ["Em qual navegador isso acontece?"]);
  passo("sem código: dúvida respondida fecha a issue; esclarecimento pendente publica a pergunta e mantém o caso aberto; ambos sem PR");

  // 7. O N1 é um agente de verdade e o andamento chega aos poucos: cada consulta do app mostra só o que já aconteceu.
  const F = await novoTicket("Ensaio F: andamento aos poucos");
  const repoF = repoLimpo();
  const textosDe = async (autor) => (await chamar("GET", `/api/tickets/${F.ticketId}`)).dados.messages.filter((m) => m.author === autor).map((m) => m.text);
  assert.deepEqual(await textosDe("agente"), [], "logo após abrir o ticket não há fala de agente");
  const prep = await rodar(repoF, "preparar", { ISSUE_NUMBER: F.n, AGENT_DRY_RUN: "false", AGENT_PROVIDER: "claude" });
  assert.match(readFileSync(join(repoF.dir, ".agent-result/req-6.n1.prompt.md"), "utf8"), /atendimento N1[\s\S]*DADO[\s\S]*req-6\.n1\.json/);
  assert.equal(prep.saida.n1_prompt_file, ".agent-result/req-6.n1.prompt.md");
  assert.deepEqual(await textosDe("sistema"), ["Análise técnica em andamento."]);
  assert.deepEqual(await textosDe("agente"), []);
  const semN1 = await rodar(repoF, "mensagem", { ISSUE_NUMBER: F.n });
  assert.equal(semN1.saida.posted, "false", "sem resposta do agente, nada é publicado");
  assert.equal(marcas(F.n, "native-agents:reply").length, 0);
  writeFileSync(join(repoF.dir, ".agent-result/req-6.n1.json"), JSON.stringify({ requestId: "req-6", publicText: "Entendi: o cartão volta para a lista de origem ao ser solto. Vou encaminhar para a análise técnica." }));
  assert.equal((await rodar(repoF, "mensagem", { ISSUE_NUMBER: F.n })).saida.posted, "true");
  await rodar(repoF, "mensagem", { ISSUE_NUMBER: F.n });
  assert.equal(marcas(F.n, "native-agents:reply").length, 1, "retomar não repete a mensagem do N1");
  assert.deepEqual(await textosDe("agente"), ["Entendi: o cartão volta para a lista de origem ao ser solto. Vou encaminhar para a análise técnica."]);
  mkdirSync(join(repoF.dir, ".agent-result"), { recursive: true });
  writeFileSync(join(repoF.dir, ".agent-result/req-6.json"), JSON.stringify({ requestId: "req-6", outcome: "human-review" }));
  await rodar(repoF, "finalizar", { ISSUE_NUMBER: F.n, REQUEST_ID: "req-6", RUN_AGENT: "true", FINAL_STATUS: "success" });
  const ordem = (await chamar("GET", `/api/tickets/${F.ticketId}`)).dados.messages.map((m) => m.author);
  assert.deepEqual(ordem, ["usuario", "sistema", "agente", "sistema"], "a conversa segue a ordem em que as coisas aconteceram na issue");
  passo("N1 real: sem resposta do agente nada é publicado; a resposta aparece uma vez; o andamento chega em ordem a cada consulta");

  console.log("\nEnsaio de entrega concluído com GitHub simulado: nenhuma chamada real ao GitHub nem aos agentes.");
} catch (e) {
  console.error(`\nFalhou: ${e.stack ?? e.message}`);
  process.exitCode = 1;
} finally {
  servidor.close();
  github.close();
}
