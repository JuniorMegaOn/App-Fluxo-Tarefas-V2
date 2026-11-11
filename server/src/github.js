// Cliente mínimo da API REST do GitHub (fetch nativo, sem SDK).
// A credencial fica só no servidor e vem do ambiente: GITHUB_REPO ("dono/repo") e GITHUB_ISSUES_TOKEN.
// Sem as duas variáveis, o atendimento funciona normalmente, só que sem issue.

export function configGithub() {
  const repo = process.env.GITHUB_REPO ?? "";
  const token = process.env.GITHUB_ISSUES_TOKEN ?? "";
  return /^[\w.-]+\/[\w.-]+$/.test(repo) && token ? { repo, token } : null;
}

async function pedir(cfg, metodo, caminho, corpo) {
  const r = await fetch(`https://api.github.com/repos/${cfg.repo}${caminho}`, {
    method: metodo,
    headers: {
      authorization: `Bearer ${cfg.token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json",
      "user-agent": "fluxo-atendimento",
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(8000), // o GitHub lento não pode pendurar as rotas do app
  });
  // A mensagem não inclui cabeçalhos nem corpo: nada de credencial vaza para log ou resposta.
  if (!r.ok) throw new Error(`GitHub respondeu ${r.status} em ${metodo} ${caminho}`);
  return r.json();
}

export const criarIssue = (cfg, { title, body, labels }) => pedir(cfg, "POST", "/issues", { title, body, labels });
export const listarComentarios = (cfg, numero) => pedir(cfg, "GET", `/issues/${numero}/comments?per_page=100`);
