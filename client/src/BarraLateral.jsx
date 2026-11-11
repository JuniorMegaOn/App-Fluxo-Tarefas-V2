import { Botao } from "./componentes/Botao.jsx";
import { Icone } from "./componentes/Icone.jsx";

const AREAS = [
  { id: "quadros", rotulo: "Quadros", icone: "colunas" },
  { id: "atendimento", rotulo: "Atendimento", icone: "conversa" },
];

/** Lateral com o menu de áreas, a lista de quadros e o atalho para criar um novo. */
export function BarraLateral({ visao, aoMudarVisao, quadros, quadroId, aoSelecionar, aoNovoQuadro, aoRenomear, aoExcluir }) {
  return (
    <aside className="lateral" aria-label="Navegação">
      <a className="marca" href="/" aria-label="Fluxo, voltar ao início" style={{ textDecoration: "none" }}>
        <span className="marca-simbolo" aria-hidden="true">
          <Icone nome="colunas" tamanho={18} />
        </span>
        <span className="marca-nome">Fluxo</span>
      </a>

      <nav aria-label="Áreas">
        <ul className="lateral-menu">
          {AREAS.map((area) => (
            <li key={area.id}>
              <button
                type="button"
                className="lateral-menu-item"
                data-ativo={visao === area.id ? "" : undefined}
                aria-current={visao === area.id ? "page" : undefined}
                onClick={() => aoMudarVisao(area.id)}
              >
                <Icone nome={area.icone} tamanho={18} />
                <span>{area.rotulo}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {visao !== "quadros" ? null : (
        <>

      <div className="lateral-topo">
        <h2 className="lateral-titulo">Quadros</h2>
        <Botao variante="fantasma" icone="mais" aria-label="Criar quadro" onClick={aoNovoQuadro} />
      </div>

      {quadros === null ? (
        <p className="lateral-vazio">Carregando quadros…</p>
      ) : quadros.length ? (
        <ul className="lateral-lista">
          {quadros.map((quadro) => (
            <li key={quadro.id}>
              <div className="lateral-item" data-ativo={quadro.id === quadroId ? "" : undefined}>
                <button
                  type="button"
                  className="lateral-escolha"
                  aria-current={quadro.id === quadroId ? "page" : undefined}
                  onClick={() => aoSelecionar(quadro.id)}
                >
                  {quadro.title}
                </button>
                <span className="lateral-acoes">
                  <Botao variante="fantasma" icone="lapis" aria-label={`Renomear quadro ${quadro.title}`} onClick={() => aoRenomear(quadro)} />
                  <Botao variante="fantasma" icone="lixeira" aria-label={`Excluir quadro ${quadro.title}`} onClick={() => aoExcluir(quadro)} />
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="lateral-vazio">Nenhum quadro ainda. Crie o primeiro para começar.</p>
      )}
        </>
      )}
    </aside>
  );
}
