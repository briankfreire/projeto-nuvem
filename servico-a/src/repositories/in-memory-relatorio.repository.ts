import type { Relatorio, TipoConsumidor } from "../domain/relatorio.entity";
import type { ListRelatoriosQueryDto } from "../dtos/list-relatorios-query.dto";
import type { ContagensDto } from "../dtos/relatorio-stats.dto";
import { UnprocessableError } from "../errors/app-error";
import type { NovoRelatorio, RelatorioRepository, ResultadoCriacao } from "./relatorio.repository";

const TARIFAS: Record<TipoConsumidor, number> = { residencial: 0.8, comercial: 0.75, industrial: 0.6 };
const tipoDoMedidor = (n: number): TipoConsumidor =>
  n % 10 < 6 ? "residencial" : n % 10 < 9 ? "comercial" : "industrial";

/** Implementação em memória (mesmas regras do banco), usada nos testes. */
export class InMemoryRelatorioRepository implements RelatorioRepository {
  readonly itens = new Map<string, Relatorio>();
  private readonly porChave = new Map<string, string>();
  agora: () => Date = () => new Date();
  falharPing = false;

  async criar(novo: NovoRelatorio): Promise<ResultadoCriacao> {
    if (novo.idempotencyKey && this.porChave.has(novo.idempotencyKey)) {
      return { relatorio: structuredClone(this.itens.get(this.porChave.get(novo.idempotencyKey)!)!), existente: true };
    }
    if (novo.medidor > 200) throw new UnprocessableError(`Medidor ${novo.medidor} não cadastrado`);

    const tipo = tipoDoMedidor(novo.medidor);
    const agora = this.agora();
    const r: Relatorio = {
      id: novo.id,
      requestId: novo.requestId,
      medidor: novo.medidor,
      mes: novo.mes,
      tipo,
      tarifaKwh: TARIFAS[tipo],
      status: "pendente",
      criadoEm: agora,
      atualizadoEm: agora,
      publicadoEm: null,
      iniciadoEm: null,
      concluidoEm: null,
      processadoPor: null,
      tentativas: 0,
      erro: null,
      resultado: null,
    };
    this.itens.set(r.id, r);
    if (novo.idempotencyKey) this.porChave.set(novo.idempotencyKey, r.id);
    return { relatorio: structuredClone(r), existente: false };
  }

  async marcarPublicado(id: string) {
    const r = this.itens.get(id);
    if (r && !r.publicadoEm) r.publicadoEm = this.agora();
  }

  async reconciliarNaoPublicados(idadeSegundos: number, limite: number, publicar: (r: Relatorio) => Promise<boolean>) {
    const corte = this.agora().getTime() - idadeSegundos * 1000;
    const candidatos = [...this.itens.values()]
      .filter((r) => !r.publicadoEm && r.status === "pendente" && r.criadoEm.getTime() < corte)
      .sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime())
      .slice(0, limite);
    let n = 0;
    for (const r of candidatos) {
      if (!(await publicar(structuredClone(r)))) break;
      r.publicadoEm = this.agora();
      n++;
    }
    return n;
  }

  async buscarPorId(id: string) {
    const r = this.itens.get(id);
    return r ? structuredClone(r) : null;
  }

  async listar(f: ListRelatoriosQueryDto) {
    return [...this.itens.values()]
      .filter((r) => (f.status ? r.status === f.status : true))
      .filter((r) => (f.medidor ? r.medidor === f.medidor : true))
      .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime())
      .slice(0, f.limite)
      .map((r) => structuredClone(r));
  }

  async contagens(): Promise<ContagensDto> {
    const todos = [...this.itens.values()];
    const conta = (s: Relatorio["status"]) => todos.filter((r) => r.status === s).length;
    const concluidos = todos.filter((r) => r.status === "concluido" && r.resultado);
    const media = (v: number[]) => (v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null);
    return {
      total: todos.length,
      pendentes: conta("pendente"),
      processando: conta("processando"),
      concluidos: conta("concluido"),
      erros: conta("erro"),
      aguardandoPublicacao: todos.filter((r) => r.status === "pendente" && !r.publicadoEm).length,
      tempoMedioProcessamentoMs: media(concluidos.map((r) => r.resultado!.duracaoMs)),
      tempoMedioTotalMs: media(concluidos.map((r) => r.concluidoEm!.getTime() - r.criadoEm.getTime())),
    };
  }

  async ping() {
    if (this.falharPing) throw new Error("banco indisponível (simulado)");
  }
}
