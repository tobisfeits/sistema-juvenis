// lib/date-helpers.ts

/**
 * Converte um objeto Date em formato YYYY-MM-DD local (sem problemas de fuso horário UTC).
 */
export function formatarDataISO(d: Date): string {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

/**
 * Cria um objeto Date a partir de YYYY-MM-DD usando horário local.
 */
export function parseDataISO(iso: string): Date {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, mes - 1, dia, 12, 0, 0); // 12:00 evita saltos de fuso
}

/**
 * Obtém a data padrão para o sistema de chamada:
 * - Se hoje for Sábado (dia 6), retorna o próprio Sábado de hoje.
 * - Se hoje for Domingo (0), Segunda (1), ..., Sexta (5), retorna o SÁBADO IMEDIATAMENTE ANTERIOR.
 */
export function obterSabadoPadrao(referencia: Date = new Date()): string {
  const d = new Date(referencia.getFullYear(), referencia.getMonth(), referencia.getDate(), 12, 0, 0);
  const diaSemana = d.getDay(); // 0 = Domingo, ..., 6 = Sábado

  if (diaSemana === 6) {
    return formatarDataISO(d);
  }

  // Se for Domingo (0), subtrai 1 dia para voltar ao Sábado
  // Se for Segunda (1), subtrai 2 dias, etc.
  const diasParaSubtrair = diaSemana === 0 ? 1 : diaSemana + 1;
  d.setDate(d.getDate() - diasParaSubtrair);
  return formatarDataISO(d);
}

/**
 * Retorna o sábado anterior a uma data (ISO).
 */
export function sabadoAnterior(iso: string): string {
  const d = parseDataISO(iso);
  d.setDate(d.getDate() - 7);
  return formatarDataISO(d);
}

/**
 * Retorna o próximo sábado em relação a uma data (ISO).
 */
export function proximoSabado(iso: string): string {
  const d = parseDataISO(iso);
  d.setDate(d.getDate() + 7);
  return formatarDataISO(d);
}

/**
 * Verifica se uma data é de fato um Sábado.
 */
export function ehSabado(iso: string): boolean {
  const d = parseDataISO(iso);
  return d.getDay() === 6;
}

/**
 * Retorna a lista dos sábados recentes (ex: últimos 8 sábados + sábado de hoje se aplicável)
 * para exibição em dropdown rápido de seleção.
 */
export function listarSabadosRecentes(quantidade: number = 8): { iso: string; label: string }[] {
  const sabadoBase = parseDataISO(obterSabadoPadrao());
  const lista: { iso: string; label: string }[] = [];

  for (let i = 0; i < quantidade; i++) {
    const d = new Date(sabadoBase);
    d.setDate(d.getDate() - i * 7);
    const iso = formatarDataISO(d);
    const dia = String(d.getDate()).padStart(2, "0");
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    const ano = d.getFullYear();

    let prefixo = "";
    if (i === 0) {
      prefixo = d.toDateString() === new Date().toDateString() ? "Hoje (Sábado)" : "Último Sábado";
    } else if (i === 1) {
      prefixo = "Sábado Anterior";
    }

    const rotulo = prefixo ? `${prefixo} • ${dia}/${mes}/${ano}` : `Sábado • ${dia}/${mes}/${ano}`;
    lista.push({ iso, label: rotulo });
  }

  return lista;
}

/**
 * Formata para exibição amigável em português (ex: "Sábado, 24 de Outubro de 2026").
 */
export function formatarSabadoExtenso(iso: string): string {
  const d = parseDataISO(iso);
  const dia = d.getDate();
  const meses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  const mes = meses[d.getMonth()];
  const ano = d.getFullYear();
  return `Sábado, ${dia} de ${mes} de ${ano}`;
}

