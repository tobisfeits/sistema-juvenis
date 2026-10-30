// components/ModalRelatorioSecretaria.tsx
"use client";

import { useMemo, useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import type { Juvenil, AvaliacaoRow } from "@/types";
import { SISTEMA_PONTOS, PONTUACAO_MAXIMA } from "@/types";

interface ModalRelatorioSecretariaProps {
  juvenis: Juvenil[];
  onFechar: () => void;
}

type ResumoJuvenil = {
  id: number;
  nome: string;
  presencas: number;
  pontualidade: number;
  licoes: number;
  biblias: number;
  pontosTotais: number;
  mediaPorSabado: number;
  frequenciaPct: number;
};

export function ModalRelatorioSecretaria({
  juvenis,
  onFechar,
}: ModalRelatorioSecretariaProps) {
  const supabase = useMemo(() => createClient(), []);

  const dataAtual = new Date();
  const mesAtual = String(dataAtual.getMonth() + 1).padStart(2, "0");
  const anoAtual = String(dataAtual.getFullYear());

  const [mesSelecionado, setMesSelecionado] = useState(`${anoAtual}-${mesAtual}`);
  const [carregando, setCarregando] = useState(true);
  const [avaliacoesMes, setAvaliacoesMes] = useState<AvaliacaoRow[]>([]);
  const [sabadosComRegistro, setSabadosComRegistro] = useState<string[]>([]);

  useEffect(() => {
    async function buscarDadosMes() {
      setCarregando(true);
      const [ano, mes] = mesSelecionado.split("-");
      const ultimoDia = new Date(Number(ano), Number(mes), 0).getDate();
      const inicio = `${ano}-${mes}-01`;
      const fim = `${ano}-${mes}-${String(ultimoDia).padStart(2, "0")}`;

      const { data, error } = await supabase
        .from("avaliacoes")
        .select("*")
        .gte("data_avaliacao", inicio)
        .lte("data_avaliacao", fim)
        .order("data_avaliacao", { ascending: true });

      if (error) {
        console.error("Erro ao buscar relatório da secretaria:", error);
        setCarregando(false);
        return;
      }

      const rows: AvaliacaoRow[] = data ?? [];
      setAvaliacoesMes(rows);

      // Descobre os sábados únicos que tiveram chamada lançada
      const sabados = Array.from(new Set(rows.map((r) => r.data_avaliacao))).sort();
      setSabadosComRegistro(sabados);
      setCarregando(false);
    }

    buscarDadosMes();
  }, [mesSelecionado, supabase]);

  // Consolidação dos dados dos alunos
  const consolidado: ResumoJuvenil[] = useMemo(() => {
    const totalSabados = sabadosComRegistro.length;

    return juvenis
      .filter((j) => j.ativo !== false)
      .map((j) => {
        const registros = avaliacoesMes.filter((a) => a.juvenil_id === j.id);
        const presencas = registros.filter((a) => a.presenca).length;
        const pontualidade = registros.filter((a) => a.pontualidade).length;
        const licoes = registros.filter((a) => a.estudo_licao).length;
        const biblias = registros.filter((a) => a.biblia).length;

        const pontosTotais = registros.reduce((soma, r) => {
          return (
            soma +
            (r.presenca ? SISTEMA_PONTOS.presenca : 0) +
            (r.pontualidade ? SISTEMA_PONTOS.pontualidade : 0) +
            (r.participacao ? SISTEMA_PONTOS.participacao : 0) +
            (r.estudo_licao ? SISTEMA_PONTOS.estudo_licao : 0) +
            (r.verso_aureo ? SISTEMA_PONTOS.verso_aureo : 0) +
            (r.biblia ? SISTEMA_PONTOS.biblia : 0)
          );
        }, 0);

        const mediaPorSabado = totalSabados > 0 ? Math.round(pontosTotais / totalSabados) : 0;
        const frequenciaPct = totalSabados > 0 ? Math.round((presencas / totalSabados) * 100) : 0;

        return {
          id: j.id,
          nome: j.nome,
          presencas,
          pontualidade,
          licoes,
          biblias,
          pontosTotais,
          mediaPorSabado,
          frequenciaPct,
        };
      })
      .sort((a, b) => b.pontosTotais - a.pontosTotais);
  }, [juvenis, avaliacoesMes, sabadosComRegistro]);

  // Totais gerais da classe para o boletim da secretaria
  const metricasGerais = useMemo(() => {
    const totalAlunos = consolidado.length;
    const totalSabados = sabadosComRegistro.length;
    if (totalAlunos === 0 || totalSabados === 0) {
      return { mediaPresencaSabado: 0, taxaLicao: 0, taxaBiblia: 0, totalPontosGeral: 0 };
    }

    const somaPresencas = consolidado.reduce((s, c) => s + c.presencas, 0);
    const somaLicoes = consolidado.reduce((s, c) => s + c.licoes, 0);
    const somaBiblias = consolidado.reduce((s, c) => s + c.biblias, 0);
    const totalPontosGeral = consolidado.reduce((s, c) => s + c.pontosTotais, 0);

    const mediaPresencaSabado = (somaPresencas / totalSabados).toFixed(1);
    const totalOportunidadesPresenca = somaPresencas > 0 ? somaPresencas : 1;
    const taxaLicao = Math.round((somaLicoes / totalOportunidadesPresenca) * 100);
    const taxaBiblia = Math.round((somaBiblias / totalOportunidadesPresenca) * 100);

    return { mediaPresencaSabado, taxaLicao, taxaBiblia, totalPontosGeral };
  }, [consolidado, sabadosComRegistro]);

  // Exportar para CSV (Excel)
  const exportarCSV = () => {
    const cabecalho = "Nome;Presenças;Freq (%);Lição da Semana;Bíblia;Pontos Totais;Média/Sábado\n";
    const linhas = consolidado
      .map(
        (c) =>
          `"${c.nome}";${c.presencas}/${sabadosComRegistro.length};${c.frequenciaPct}%;${c.licoes};${c.biblias};${c.pontosTotais};${c.mediaPorSabado}`
      )
      .join("\n");

    const conteudo = "\uFEFF" + cabecalho + linhas; // \uFEFF para UTF-8 no Excel
    const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `relatorio-secretaria-juvenis-${mesSelecionado}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-md"
      onClick={onFechar}
    >
      <div
        className="my-8 w-full max-w-4xl rounded-3xl border border-white/10 bg-gradient-to-b from-slate-900 via-slate-950 to-black p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">📋</span>
              <h2 className="bg-gradient-to-r from-purple-200 via-fuchsia-300 to-amber-200 bg-clip-text text-xl font-black text-transparent">
                Relatório para Secretaria da Escola Sabatina
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Dados consolidados de frequência, estudo da lição e bíblia para entrega de boletim.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="month"
              value={mesSelecionado}
              onChange={(e) => setMesSelecionado(e.target.value)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 outline-none transition focus:border-purple-400"
            />
            <button
              onClick={exportarCSV}
              disabled={carregando || consolidado.length === 0}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-bold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-40"
              title="Baixar planilha compatível com Excel"
            >
              <span>📥</span>
              <span>Baixar Excel (CSV)</span>
            </button>
            <button
              onClick={onFechar}
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
              aria-label="Fechar"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Métricas Resumidas para o Boletim */}
        <div className="my-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-purple-300">
              Sábados Realizados
            </p>
            <p className="mt-1 text-2xl font-black text-white">
              {sabadosComRegistro.length}
            </p>
            <p className="text-[10px] text-slate-400">chamadas registradas</p>
          </div>

          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
              Média de Presença
            </p>
            <p className="mt-1 text-2xl font-black text-white">
              {metricasGerais.mediaPresencaSabado}
            </p>
            <p className="text-[10px] text-slate-400">alunos / sábado</p>
          </div>

          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
              Taxa Estudo Lição
            </p>
            <p className="mt-1 text-2xl font-black text-white">
              {metricasGerais.taxaLicao}%
            </p>
            <p className="text-[10px] text-slate-400">dos presentes estudaram</p>
          </div>

          <div className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-300">
              Taxa com Bíblia
            </p>
            <p className="mt-1 text-2xl font-black text-white">
              {metricasGerais.taxaBiblia}%
            </p>
            <p className="text-[10px] text-slate-400">dos presentes trouxeram</p>
          </div>
        </div>

        {/* Tabela Detalhada por Juvenil */}
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60">
          {carregando ? (
            <div className="py-12 text-center text-sm text-slate-400 animate-pulse">
              Carregando dados da secretaria...
            </div>
          ) : consolidado.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Nenhuma avaliação encontrada para o mês selecionado.
            </div>
          ) : (
            <div className="max-h-[50vh] overflow-x-auto overflow-y-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="sticky top-0 z-10 border-b border-white/10 bg-slate-900 text-purple-300">
                    <th className="px-4 py-3 font-bold">Juvenil</th>
                    <th className="px-3 py-3 text-center font-bold">Presenças</th>
                    <th className="px-3 py-3 text-center font-bold">Assiduidade</th>
                    <th className="px-3 py-3 text-center font-bold">Lição</th>
                    <th className="px-3 py-3 text-center font-bold">Bíblia</th>
                    <th className="px-3 py-3 text-center font-bold">Pontos Totais</th>
                    <th className="px-3 py-3 text-center font-bold">Média/Sábado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {consolidado.map((c) => (
                    <tr key={c.id} className="transition hover:bg-white/[0.02]">
                      <td className="px-4 py-3 font-semibold text-slate-100">{c.nome}</td>
                      <td className="px-3 py-3 text-center font-mono text-slate-300">
                        {c.presencas}/{sabadosComRegistro.length}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 font-bold ${
                            c.frequenciaPct >= 75
                              ? "bg-emerald-500/20 text-emerald-300"
                              : c.frequenciaPct >= 50
                              ? "bg-amber-500/20 text-amber-300"
                              : "bg-red-500/20 text-red-300"
                          }`}
                        >
                          {c.frequenciaPct}%
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center font-semibold text-purple-300">
                        {c.licoes}x
                      </td>
                      <td className="px-3 py-3 text-center font-semibold text-blue-300">
                        {c.biblias}x
                      </td>
                      <td className="px-3 py-3 text-center font-black text-amber-300">
                        {c.pontosTotais}
                      </td>
                      <td className="px-3 py-3 text-center font-bold text-slate-300">
                        {c.mediaPorSabado} pts
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Rodapé informativo */}
        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 gap-2">
          <p>Dica: O botão "Baixar Excel (CSV)" gera um arquivo perfeito para enviar por WhatsApp para a direção da igreja.</p>
          <button
            onClick={onFechar}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/10"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

