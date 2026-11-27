import type { TipoConsumidor } from "../domain/relatorio";

/**
 * Simula as leituras de um medidor: uma leitura de potência (kW) por minuto
 * durante o mês inteiro (ex.: 31 dias x 1440 min = 44.640 leituras).
 *
 * É determinístico: o mesmo medidor + mês + tipo gera sempre as mesmas leituras,
 * então pedir o mesmo relatório duas vezes dá o mesmo resultado.
 */

/** Hash FNV-1a de 32 bits (transforma o texto numa semente numérica). */
function hash(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Gerador pseudoaleatório mulberry32 (rápido e reprodutível). */
function mulberry32(semente: number) {
  let a = semente;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function diasNoMes(mes: string): number {
  const [ano, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(ano!, m!, 0)).getUTCDate();
}

/** Curva de carga (kW) de um minuto do dia, por tipo de consumidor. */
function cargaBase(tipo: TipoConsumidor, hora: number, fimDeSemana: boolean): number {
  switch (tipo) {
    case "residencial": {
      const manha = hora >= 6 && hora < 9 ? 0.4 : 0;
      const noite = hora >= 18 && hora < 23 ? 0.8 : 0;
      const madrugada = hora < 6 ? -0.05 : 0;
      return 0.15 + manha + noite + madrugada + (fimDeSemana ? 0.1 : 0);
    }
    case "comercial": {
      const expediente = hora >= 8 && hora < 18;
      if (fimDeSemana) return expediente ? 1.2 : 0.6;
      return expediente ? 4.5 : 0.8;
    }
    case "industrial": {
      const turno = hora >= 6 && hora < 22;
      if (fimDeSemana) return turno ? 6 : 4;
      return turno ? 18 : 6;
    }
  }
}

export function gerarLeituras(medidor: number, mes: string, tipo: TipoConsumidor): { kw: Float64Array; dias: number } {
  const rnd = mulberry32(hash(`${medidor}|${mes}|${tipo}`));
  const dias = diasNoMes(mes);
  const [ano, m] = mes.split("-").map(Number);
  const escalaMedidor = 0.7 + rnd() * 0.7; // cada medidor consome um pouco diferente
  const kw = new Float64Array(dias * 1440);

  for (let d = 0; d < dias; d++) {
    const diaSemana = new Date(Date.UTC(ano!, m! - 1, d + 1)).getUTCDay();
    const fimDeSemana = diaSemana === 0 || diaSemana === 6;
    const fatorDia = 0.85 + rnd() * 0.3;

    for (let min = 0; min < 1440; min++) {
      const hora = Math.floor(min / 60);
      let p = cargaBase(tipo, hora, fimDeSemana) * escalaMedidor * fatorDia;
      p *= 0.9 + rnd() * 0.2; // ruído de medição

      // picos curtos (chuveiro, motor partindo, etc.)
      if (rnd() < 0.004) p += (tipo === "industrial" ? 25 : tipo === "comercial" ? 6 : 4) * (0.6 + rnd() * 0.4);

      kw[d * 1440 + min] = Math.max(0.05, p);
    }
  }
  return { kw, dias };
}
