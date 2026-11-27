/*
 * WattReport - front-end
 *
 * O navegador fala APENAS com o NGINX (mesma origem). Todas as chamadas vão para
 * /api/..., que o NGINX repassa ao Serviço A. O front não sabe que existem
 * PostgreSQL, RabbitMQ ou workers: ele só vê o status do relatório mudar.
 */
(() => {
  "use strict";

  const API = "/api/relatorios";
  const INTERVALO_MS = 2000;

  const $ = (id) => document.getElementById(id);
  const el = {
    form: $("form-relatorio"),
    medidor: $("medidor"),
    mes: $("mes"),
    btnCarga: $("btn-carga"),
    msg: $("form-msg"),
    pontoRabbit: $("ponto-rabbit"),
    textoRabbit: $("texto-rabbit"),
    pilulaFila: $("pilula-fila"),
    pilulaWorkers: $("pilula-workers"),
    indPendentes: $("ind-pendentes"),
    indConcluidos: $("ind-concluidos"),
    indTempo: $("ind-tempo"),
    corpo: $("corpo-tabela"),
    detMeta: $("det-meta"),
    detTitulo: $("det-titulo"),
    detConteudo: $("det-conteudo"),
    detRodape: $("det-rodape"),
  };

  let selecionadoId = null;
  let ultimaLista = [];

  // ---------- formatação ----------
  const nf = (casas) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  const kwh = (v) => `${nf(1).format(v)} kWh`;
  const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const segundos = (ms) => `${nf(1).format(ms / 1000)} s`;
  const idCurto = (id) => id.slice(0, 6);
  const ROTULO_STATUS = { pendente: "pendente", processando: "processando", concluido: "concluído", erro: "erro" };
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

  /** UUID v4 com crypto.getRandomValues (funciona também em http://IP, fora de "secure context"). */
  function novaChave() {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  function criar(tag, classe, texto) {
    const n = document.createElement(tag);
    if (classe) n.className = classe;
    if (texto !== undefined) n.textContent = texto; // textContent: nunca interpreta HTML
    return n;
  }

  function mensagem(texto, tipo = "") {
    el.msg.textContent = texto;
    el.msg.className = `form-msg${tipo ? ` form-msg--${tipo}` : ""}`;
  }

  // ---------- chamadas à API ----------
  async function api(caminho, opcoes = {}) {
    const res = await fetch(caminho, { ...opcoes, headers: { "Content-Type": "application/json", ...(opcoes.headers ?? {}) } });
    const corpo = await res.json().catch(() => null);
    if (!res.ok) {
      const detalhe = corpo?.details?.map((d) => `${d.field}: ${d.message}`).join("; ");
      const erro = new Error(detalhe || corpo?.error || `HTTP ${res.status}`);
      erro.status = res.status;
      throw erro;
    }
    return { corpo, status: res.status, requestId: res.headers.get("X-Request-Id") };
  }

  /**
   * Cria um relatório com uma Idempotency-Key própria. Em falha de rede, 429 ou 5xx,
   * tenta de novo com a MESMA chave: se o primeiro POST tiver chegado, a API devolve
   * o mesmo relatório em vez de criar outro.
   */
  async function criarRelatorio(dados) {
    const chave = novaChave();
    for (let tentativa = 1; ; tentativa++) {
      try {
        return await api(API, { method: "POST", body: JSON.stringify(dados), headers: { "Idempotency-Key": chave } });
      } catch (err) {
        const repetivel = !err.status || err.status === 429 || err.status >= 500;
        if (!repetivel || tentativa >= 3) throw err;
        await esperar(400 * tentativa);
      }
    }
  }

  // ---------- formulário ----------
  el.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const dados = { medidor: Number(el.medidor.value), mes: el.mes.value };
    const botao = el.form.querySelector("button[type=submit]");
    botao.disabled = true;
    try {
      const { corpo, status, requestId } = await criarRelatorio(dados);
      selecionadoId = corpo.id;
      const fila = corpo.publicadoEm ? "na fila" : "gravado; aguardando o RabbitMQ (outbox)";
      mensagem(`Pedido aceito (${status}) · relatório ${idCurto(corpo.id)} ${fila} · requestId ${requestId ?? "—"}`, "ok");
      await atualizar();
    } catch (err) {
      mensagem(`Erro: ${err.message}`, "erro");
    } finally {
      botao.disabled = false;
    }
  });

  el.btnCarga.addEventListener("click", async () => {
    el.btnCarga.disabled = true;
    mensagem("Enviando 50 pedidos…");
    const mes = el.mes.value || new Date().toISOString().slice(0, 7);
    const pedidos = Array.from({ length: 50 }, () => ({ medidor: 1 + Math.floor(Math.random() * 200), mes }));
    const resultados = await Promise.allSettled(pedidos.map(criarRelatorio));
    const ok = resultados.filter((r) => r.status === "fulfilled").length;
    mensagem(`${ok} de 50 pedidos aceitos.`, ok === 50 ? "ok" : "erro");
    el.btnCarga.disabled = false;
    await atualizar();
  });

  // ---------- renderização ----------
  function renderStats(s) {
    const conectado = s.fila.conectado;
    el.pontoRabbit.classList.toggle("ponto--off", !conectado);
    el.textoRabbit.textContent = conectado ? "RabbitMQ conectado" : "RabbitMQ desconectado";
    el.pilulaFila.textContent = conectado
      ? `fila: ${s.fila.mensagens ?? "—"} msgs`
      : `aguardando publicação: ${s.aguardandoPublicacao}`;
    el.pilulaWorkers.textContent = `workers B: ${s.fila.consumidores ?? "—"}`;
    el.indPendentes.textContent = String(s.pendentes + s.processando);
    el.indConcluidos.replaceChildren(String(s.concluidos));
    if (s.erros) el.indConcluidos.append(criar("small", "valor__erros", `${s.erros} erro${s.erros > 1 ? "s" : ""}`));
    el.indTempo.textContent = s.tempoMedioProcessamentoMs == null ? "—" : segundos(s.tempoMedioProcessamentoMs);
  }

  function renderTabela(lista) {
    el.corpo.replaceChildren();
    if (!lista.length) {
      const tr = criar("tr", "vazio");
      const td = criar("td", "", "Nenhum relatório ainda. Gere o primeiro!");
      td.colSpan = 6;
      tr.append(td);
      el.corpo.append(tr);
      return;
    }

    for (const r of lista) {
      const tr = criar("tr", r.id === selecionadoId ? "selecionada" : "");
      tr.title = `id ${r.id}\nrequestId ${r.requestId}\ntentativas ${r.tentativas}`;
      const tdStatus = criar("td");
      tdStatus.append(criar("span", `selo selo--${r.status}`, ROTULO_STATUS[r.status] ?? r.status));

      tr.append(
        criar("td", "mono", idCurto(r.id)),
        criar("td", "mono", String(r.medidor)),
        criar("td", "mono", r.mes),
        tdStatus,
        criar("td", "mono direita", r.resultado ? kwh(r.resultado.consumoTotalKwh) : "—"),
        criar("td", "mono suave", r.processadoPor ?? "—"),
      );
      tr.addEventListener("click", () => {
        selecionadoId = r.id;
        renderTabela(ultimaLista);
        renderDetalhe(r);
      });
      el.corpo.append(tr);
    }
  }

  function metrica(rotulo, valor, destaque = false) {
    const box = criar("div", "metrica");
    box.append(criar("span", "", rotulo), criar("strong", destaque ? "destaque" : "", valor));
    return box;
  }

  function renderDetalhe(r) {
    if (!r) return;
    el.detMeta.textContent = `${idCurto(r.id)} · medidor ${r.medidor} · ${r.mes}`;
    el.detTitulo.textContent = `Relatório ${r.tipo}`;
    el.detConteudo.replaceChildren();

    if (r.status !== "concluido" || !r.resultado) {
      const textos = {
        pendente: r.publicadoEm
          ? "Na fila do RabbitMQ, aguardando um worker do Serviço B."
          : "Gravado no banco, aguardando o RabbitMQ para ser publicado (outbox).",
        processando: `Sendo processado por ${r.processadoPor ?? "um worker"}…`,
        erro: `Erro: ${r.erro ?? "erro desconhecido"}`,
      };
      const caixa = criar("div", `detalhe__aguardando${r.status === "erro" ? " detalhe__erro" : ""}`, textos[r.status] ?? r.status);
      el.detConteudo.append(caixa);
      el.detRodape.textContent = `status: ${ROTULO_STATUS[r.status] ?? r.status} · tentativas: ${r.tentativas}`;
      return;
    }

    const res = r.resultado;
    const pico = new Date(res.picoEm);
    const dd = (n) => String(n).padStart(2, "0");
    const dataPico = `${dd(pico.getUTCDate())}/${dd(pico.getUTCMonth() + 1)} ${dd(pico.getUTCHours())}:${dd(pico.getUTCMinutes())}`;

    const metricas = criar("div", "metricas");
    metricas.append(
      metrica("Consumo total", kwh(res.consumoTotalKwh), true),
      metrica("Custo estimado", brl(res.custoEstimado)),
      metrica("Média diária", kwh(res.mediaDiariaKwh)),
      metrica(`Pico · ${dataPico}`, `${nf(1).format(res.picoKw)} kW`),
    );

    // gráfico de barras: altura de cada dia relativa ao maior consumo diário
    const grafico = criar("div", "grafico");
    grafico.append(criar("span", "grafico__titulo", "Consumo por dia (kWh)"));
    const barras = criar("div", "barras");
    const max = Math.max(...res.consumoDiarioKwh);
    const diaPico = pico.getUTCDate() - 1;
    res.consumoDiarioKwh.forEach((v, i) => {
      const barra = criar("i", i === diaPico ? "pico" : "");
      barra.style.setProperty("--h", `${Math.max(4, (v / max) * 100)}%`);
      barra.title = `dia ${i + 1}: ${kwh(v)}`;
      barras.append(barra);
    });
    const eixo = criar("div", "grafico__eixo");
    const dias = res.consumoDiarioKwh.length;
    eixo.append(criar("span", "", "01"), criar("span", "", dd(Math.ceil(dias / 2))), criar("span", "", String(dias)));
    grafico.append(barras, eixo);

    el.detConteudo.append(metricas, grafico);
    el.detRodape.textContent =
      `processado por ${r.processadoPor} · ${res.leituras.toLocaleString("pt-BR")} leituras · ${segundos(res.duracaoMs)}` +
      ` · tarifa ${brl(r.tarifaKwh)}/kWh` +
      (r.tentativas > 1 ? ` · ${r.tentativas} tentativas` : "");
  }

  // ---------- atualização periódica ----------
  async function atualizar() {
    try {
      const [{ corpo: lista }, { corpo: stats }] = await Promise.all([api(`${API}?limite=15`), api(`${API}/stats`)]);
      ultimaLista = lista;
      renderStats(stats);

      if (!selecionadoId && lista.length) selecionadoId = lista[0].id;
      renderTabela(lista);

      let sel = lista.find((r) => r.id === selecionadoId);
      if (!sel && selecionadoId) sel = (await api(`${API}/${selecionadoId}`).catch(() => null))?.corpo;
      renderDetalhe(sel);
    } catch {
      el.pontoRabbit.classList.add("ponto--off");
      el.textoRabbit.textContent = "API indisponível";
    }
  }

  if (!el.mes.value) el.mes.value = new Date().toISOString().slice(0, 7);
  atualizar();
  setInterval(atualizar, INTERVALO_MS);
})();
