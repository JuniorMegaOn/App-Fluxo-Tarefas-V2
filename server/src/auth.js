// Autenticação por sessão, pronta para usar: cadastro, login, logout e "quem sou eu".
// Senha com scrypt e sal; o cookie guarda um token aleatório e o banco guarda só o hash dele.
// Para proteger uma rota: app.get("/api/privado", exigirSessao(db), (ctx) => ...ctx.estado.usuario...)
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { ErroHttp, invalido, texto } from "./http.js";

const DIAS = 30;
const COOKIE = "sessao";
const hashDoToken = (t) => createHash("sha256").update(t).digest("hex");

function hashDaSenha(senha, sal = randomBytes(16).toString("hex")) {
  return `${sal}:${scryptSync(senha, sal, 64).toString("hex")}`;
}
function senhaConfere(senha, guardado) {
  const [sal, hash] = guardado.split(":");
  const a = Buffer.from(hash, "hex"), b = scryptSync(senha, sal, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}
const publico = (u) => ({ id: u.id, email: u.email, nome: u.nome });

function tokenDoPedido(req) {
  const c = (req.headers.cookie ?? "").split(";").map((p) => p.trim()).find((p) => p.startsWith(`${COOKIE}=`));
  return c ? c.slice(COOKIE.length + 1) : null;
}

export function usuarioDaSessao(db, req) {
  const token = tokenDoPedido(req);
  if (!token) return null;
  const l = db.prepare("SELECT u.* FROM sessao s JOIN usuario u ON u.id = s.usuario_id WHERE s.token_hash = ? AND s.expira_em > ?")
    .get(hashDoToken(token), new Date().toISOString());
  return l ?? null;
}

/** Tratador que barra quem não está logado e deixa o usuário em `ctx.estado.usuario`. */
export const exigirSessao = (db) => (ctx) => {
  const u = usuarioDaSessao(db, ctx.req);
  if (!u) throw new ErroHttp(401, "Entre para continuar.");
  ctx.estado.usuario = publico(u);
};

export function rotasDeAuth(app, db) {
  const abrirSessao = (res, usuario) => {
    const token = randomBytes(32).toString("hex");
    const expira = new Date(Date.now() + DIAS * 86_400_000);
    db.prepare("INSERT INTO sessao (token_hash, usuario_id, expira_em) VALUES (?, ?, ?)").run(hashDoToken(token), usuario.id, expira.toISOString());
    res.setHeader("set-cookie", `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${DIAS * 86_400}`);
  };

  app.post("/api/auth/cadastro", ({ corpo, res }) => {
    const email = texto(corpo, "email", { min: 5, max: 200 }).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw invalido("Informe um e-mail válido.");
    const nome = texto(corpo, "nome", { max: 120 });
    const senha = texto(corpo, "senha", { min: 8, max: 200 });
    if (db.prepare("SELECT 1 FROM usuario WHERE email = ?").get(email)) throw new ErroHttp(409, "Este e-mail já tem cadastro.");
    const usuario = { id: randomUUID(), email, nome };
    db.prepare("INSERT INTO usuario (id, email, nome, senha_hash, criado_em) VALUES (?, ?, ?, ?, ?)")
      .run(usuario.id, email, nome, hashDaSenha(senha), new Date().toISOString());
    abrirSessao(res, usuario);
    return usuario;
  });

  app.post("/api/auth/login", ({ corpo, res, estado }) => {
    const email = texto(corpo, "email", { min: 3, max: 200 }).toLowerCase();
    const senha = texto(corpo, "senha", { min: 1, max: 200 });
    const u = db.prepare("SELECT * FROM usuario WHERE email = ?").get(email);
    if (!u || !senhaConfere(senha, u.senha_hash)) throw new ErroHttp(401, "E-mail ou senha incorretos.");
    abrirSessao(res, u);
    estado.status = 200;
    return publico(u);
  });

  app.post("/api/auth/logout", ({ req, res }) => {
    const token = tokenDoPedido(req);
    if (token) db.prepare("DELETE FROM sessao WHERE token_hash = ?").run(hashDoToken(token));
    res.setHeader("set-cookie", `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  });

  app.get("/api/auth/eu", exigirSessao(db), ({ estado }) => estado.usuario);
}
