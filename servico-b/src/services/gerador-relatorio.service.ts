import type { ResultadoConsumo, TipoConsumidor } from "../domain/relatorio";
import type { Clock } from "../shared/clock";
import { gerarLeituras } from "./simulador-leituras";

export interface PedidoGeracao {
  medidor: number;
  mes: string;
  tipo: TipoConsumidor;
}

const arred = (v: number, casas: number) => Math.round(v * 10 ** casas) / 10 ** casas;
const proximoCiclo = () => new Promise<void>((r) => setImmediate(r));

/**
 * Gera o relatório de consumo a partir das leituras simuladas.
 *
 * trabalhoCpuMs simula um processamento pesado (validação de leituras,
 * detecção de anomalias...). É ele que faz o uso de CPU subir quando
 * chegam muitos pedidos, o que permite demonstrar o HPA por CPU.
 * Configurado pela variável de ambiente TRABALHO_CPU_MS.
 */
export class GeradorRelatorioService {
  constructor(
    private readonly clock: Clock,
    private readonly trabalhoCpuMs: number,
  ) {}

  async gerar(p: PedidoGeracao): Promise<ResultadoConsumo> {
    const inicio = this.clock.now().getTime();
    const { kw, dias } = gerarLeituras(p.medidor, p.mes, p.tipo);

    const consumoDiario = new Array<number>(dias).fill(0);
    let picoKw = 0;
    let picoIdx = 0;

    for (let i = 0; i < kw.length; i++) {
      const v = kw[i]!;
      consumoDiario[Math.floor(i / 1440)]! += v / 60; // kW durante 1 min -> kWh
      if (v > picoKw) {
        picoKw = v;
        picoIdx = i;
      }
    }

    await this.consumirCpu(this.trabalhoCpuMs);

    const total = consumoDiario.reduce((s, v) => s + v, 0);
    const [ano, m] = p.mes.split("-").map(Number);

    return {
      consumoTotalKwh: arred(total, 2),
      mediaDiariaKwh: arred(total / dias, 2),
      picoKw: arred(picoKw, 2),
      picoEm: new Date(Date.UTC(ano!, m! - 1, 1) + picoIdx * 60_000),
      consumoDiarioKwh: consumoDiario.map((v) => arred(v, 2)),
      leituras: kw.length,
      duracaoMs: this.clock.now().getTime() - inicio,
    };
  }

  /**
   * Ocupa a CPU por ~ms milissegundos, em fatias de 50 ms.
   * Entre as fatias devolve o controle ao event loop, para o processo continuar
   * respondendo ao health check e aos heartbeats do RabbitMQ.
   */
  private async consumirCpu(ms: number) {
    const fim = Date.now() + ms;
    let acumulador = 0;
    while (Date.now() < fim) {
      const fatia = Math.min(Date.now() + 50, fim);
      while (Date.now() < fatia) {
        for (let i = 0; i < 10_000; i++) acumulador += Math.sqrt(i) * Math.sin(i);
      }
      await proximoCiclo();
    }
    return acumulador;
  }
}
