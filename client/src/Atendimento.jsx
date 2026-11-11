import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { Botao } from "./componentes/Botao.jsx";
import "./atendimento.css";

/**
 * Área de atendimento: cada ticket é uma conversa. À esquerda, os atendimentos abertos;
 * à direita, a conversa com o campo de resposta embaixo, no estilo de um chat.
 * Quando agentes autônomos existirem, as respostas delas aparecem aqui como mensagens "agente".
 */

const hora = (iso) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dia = (iso) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
const FASE = {
  preparado: "Encaminhado para análise técnica",
  executando: "Em análise técnica",
  "pr-aberto": "Alteração em revisão",
  "aguardando-cliente": "Aguardando a sua resposta",
  concluido: "Análise técnica concluída",
  respondido: "Atendimento respondido",
  falhou: "Aguardando uma pessoa da equipe",
  "pendente-instrutor": "Aguardando uma pessoa da equipe",
};

function Mensagem({ mensagem }) {
  if (mensagem.author === "sistema") {
    return <p className="atend-sistema">{mensagem.text} · {hora(mensagem.createdAt)}</p>;
  }
  return (
    <div className="atend-msg" data-autor={mensagem.author}>
      {mensagem.author === "agente" ? <span className="atend-msg-autor">Agente</span> : null}
      <div className="atend-msg-texto">{mensagem.text}</div>
      <time className="atend-msg-hora" dateTime={mensagem.createdAt}>{hora(mensagem.createdAt)}</time>
    </div>
  );
}

export function Atendimento() {
  const [tickets, setTickets] = useState(null);
  const [ativoId, setAtivoId] = useState(null);
  const [conversa, setConversa] = useState(null);
  const [novo, setNovo] = useState(false);
  const [texto, setTexto] = useState("");
  const [tituloNovo, setTituloNovo] = useState("");
  const [descricaoNovo, setDescricaoNovo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const fimRef = useRef(null);
  const entradaRef = useRef(null);
  const tituloRef = useRef(null);
  const ativoRef = useRef(null);

  const atualizarLista = async () => {
    const dados = await api.atendimento.listar();
    setTickets(dados.tickets);
  };

  const abrir = async (id) => {
    ativoRef.current = id;
    setNovo(false);
    setAtivoId(id);
    setErro(null);
    try {
      const dados = await api.atendimento.detalhe(id);
      if (ativoRef.current === id) setConversa(dados);
    } catch (e) {
      if (ativoRef.current === id) setErro(e.message);
    }
  };

  const novaConversa = () => {
    ativoRef.current = null;
    setNovo(true);
    setAtivoId(null);
    setConversa(null);
    setErro(null);
    setTexto("");
    setTituloNovo("");
    setDescricaoNovo("");
  };

  // Primeira carga: abre o atendimento mais recente, ou a tela de novo atendimento se não houver nenhum.
  useEffect(() => {
    let vivo = true;
    api.atendimento
      .listar()
      .then((dados) => {
        if (!vivo) return;
        setTickets(dados.tickets);
        if (dados.tickets.length) abrir(dados.tickets[0].id);
        else setNovo(true);
      })
      .catch((e) => {
        if (!vivo) return;
        setErro(e.message);
        setTickets([]);
        setNovo(true);
      });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mantém a conversa sempre no fim e o campo ajustado ao texto digitado.
  useEffect(() => {
    fimRef.current?.scrollIntoView?.({ block: "end" });
  }, [conversa]);

  useLayoutEffect(() => {
    const el = entradaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [texto]);

  useEffect(() => {
    if (novo) tituloRef.current?.focus();
    else entradaRef.current?.focus();
  }, [ativoId, novo]);

  // Abre um atendimento novo com título (obrigatório) e descrição (opcional).
  const abrirAtendimento = async (evento) => {
    evento?.preventDefault();
    const titulo = tituloNovo.trim();
    if (!titulo || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const dados = await api.atendimento.abrir(titulo, descricaoNovo.trim());
      ativoRef.current = dados.ticket.id;
      setConversa(dados);
      setAtivoId(dados.ticket.id);
      setNovo(false);
      setTituloNovo("");
      setDescricaoNovo("");
      await atualizarLista();
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  // Responde numa conversa já aberta.
  const responder = async (evento) => {
    evento?.preventDefault();
    const mensagem = texto.trim();
    if (!mensagem || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      await api.atendimento.responder(ativoId, mensagem);
      setConversa(await api.atendimento.detalhe(ativoId));
      setTexto("");
      await atualizarLista();
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const teclar = (evento) => {
    if (evento.key === "Enter" && !evento.shiftKey && !evento.nativeEvent.isComposing) {
      evento.preventDefault();
      responder();
    }
  };

  const alternarStatus = async () => {
    const proximo = conversa.ticket.status === "aberto" ? "resolvido" : "aberto";
    setErro(null);
    try {
      await api.atendimento.mudarStatus(ativoId, proximo);
      setConversa(await api.atendimento.detalhe(ativoId));
      await atualizarLista();
    } catch (e) {
      setErro(e.message);
    }
  };

  const avisoErro = erro ? <p className="atend-erro" role="alert">{erro}</p> : null;

  const composer = (
    <form className="atend-composer" onSubmit={responder}>
      <textarea
        ref={entradaRef}
        className="atend-entrada"
        rows={1}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={teclar}
        disabled={enviando}
        maxLength={5000}
        aria-label="Mensagem"
        placeholder="Escreva uma resposta"
      />
      <Botao variante="primario" icone="enviar" type="submit" aria-label="Enviar mensagem" disabled={enviando || !texto.trim()} />
    </form>
  );

  const formNovo = (
    <form className="atend-novo" onSubmit={abrirAtendimento}>
      <label className="atend-campo">
        <span>Título</span>
        <input
          ref={tituloRef}
          type="text"
          value={tituloNovo}
          onChange={(e) => setTituloNovo(e.target.value)}
          disabled={enviando}
          maxLength={120}
          required
          placeholder="Resuma o problema em uma linha"
        />
      </label>
      <label className="atend-campo">
        <span>Descrição <em>(opcional)</em></span>
        <textarea
          value={descricaoNovo}
          onChange={(e) => setDescricaoNovo(e.target.value)}
          disabled={enviando}
          maxLength={5000}
          rows={5}
          placeholder="Conte o que aconteceu, o que você esperava e o que já tentou"
        />
      </label>
      <div className="atend-novo-acoes">
        <Botao variante="primario" type="submit" disabled={enviando || !tituloNovo.trim()}>Abrir atendimento</Botao>
      </div>
    </form>
  );

  return (
    <section className="atend" aria-label="Atendimento">
      <aside className="atend-lista" aria-label="Seus atendimentos">
        <div className="atend-lista-topo">
          <Botao variante="suave" icone="mais" onClick={novaConversa}>Novo atendimento</Botao>
        </div>
        <div className="atend-lista-itens">
          {tickets === null ? (
            <p className="atend-vazio">Carregando atendimentos…</p>
          ) : tickets.length === 0 ? (
            <p className="atend-vazio">Nenhum atendimento ainda.</p>
          ) : (
            <ul>
              {tickets.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className="atend-item"
                    data-ativo={!novo && t.id === ativoId ? "" : undefined}
                    aria-current={!novo && t.id === ativoId ? "true" : undefined}
                    onClick={() => abrir(t.id)}
                  >
                    <span className="atend-item-titulo">{t.title}</span>
                    <span className="atend-item-meta">
                      {t.status === "resolvido" ? "Resolvido · " : ""}{dia(t.updatedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <div className="atend-principal">
        {novo ? (
          <div className="atend-boas-vindas">
            <h2>Como podemos ajudar?</h2>
            <p>Dê um título ao que aconteceu e descreva os detalhes. Cada atendimento vira uma conversa que você acompanha aqui.</p>
            {avisoErro}
            {formNovo}
          </div>
        ) : conversa ? (
          <>
            <header className="atend-topo">
              <h2 className="atend-topo-titulo">{conversa.ticket.title}</h2>
              <Botao variante="suave" onClick={alternarStatus}>
                {conversa.ticket.status === "aberto" ? "Marcar como resolvido" : "Reabrir"}
              </Botao>
            </header>
            <div className="atend-mensagens" role="log" aria-live="polite">
              {FASE[conversa.execution?.phase] ? <p className="atend-sistema">{FASE[conversa.execution.phase]}</p> : null}
              {conversa.messages.map((m) => <Mensagem key={m.id} mensagem={m} />)}
              <div ref={fimRef} />
            </div>
            <div className="atend-rodape">
              {avisoErro}
              {composer}
            </div>
          </>
        ) : (
          <div className="atend-vazio-principal">
            {avisoErro ?? <p>Escolha um atendimento na lista ou abra um novo.</p>}
          </div>
        )}
      </div>
    </section>
  );
}
