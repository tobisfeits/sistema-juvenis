"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

type Juvenil = { id: number; nome: string };

type AvaliacaoRow = {
  juvenil_id: number;
  data_avaliacao: string;
  presenca: boolean;
  pontualidade: boolean;
  participacao: boolean;
  estudo_licao: boolean;
  verso_aureo: boolean;
  biblia: boolean;
};

type PremiacaoRow = {
  id?: number;
  ano: number;
  trimestre: number;
  juvenil_id: number;
  colocacao: number;
  entregue: boolean;
  data_entrega: string | null;
  responsavel: string | null;
};

const SISTEMA_PONTOS = {
  presenca: 20,
  pontualidade: 10,
  participacao: 10,
  estudo_licao: 25,
  verso_aureo: 20,
  biblia: 15,
} as const;

type Criterio = keyof typeof SISTEMA_PONTOS;
const CRITERIOS = Object.keys(SISTEMA_PONTOS) as Criterio[];

const TRIMESTRES = [
  { nome: "1º Trimestre", meses: [1, 2, 3] },
  { nome: "2º Trimestre", meses: [4, 5, 6] },
  { nome: "3º Trimestre", meses: [7, 8, 9] },
  { nome: "4º Trimestre", meses: [10, 11, 12] },
];

function trimestreAtual(): number {
  const mes = new Date().getMonth() + 1;
  if (mes <= 3) return 0;
  if (mes <= 6) return 1;
  if (mes <= 9) return 2;
  return 3;
}

function medalha(pos: number) {
  if (pos === 1) return "🥇";
  if (pos === 2) return "🥈";
  if (pos === 3) return "🥉";
  return `${pos}º`;
}

export default function PremiacoesPage() {
  const supabase = createClient();

  const [juvenis, setJuvenis] = useState<Juvenil[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<AvaliacaoRow[]>([]);
  const [premiacoes, setPremiacoes] = useState<PremiacaoRow[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [dark, setDark] = useState(false);
  const [verificandoAuth, setVerificandoAuth] = useState(true);
  const [logado, setLogado] = useState(false);

  const anoAtual = new Date().getFullYear();

  /* ----------------------- Carregar ------------------------------ */

  useEffect(() => {
    async function carregar() {
      const [j, a, p] = await Promise.all([
        supabase.from("juvenis").select("id, nome").order("id"),
        supabase.from("avaliacoes").select("*"),
        supabase.from("premiacoes").select("*").eq("ano", anoAtual),
      ]);
      setJuvenis(j.data ?? []);
      setAvaliacoes(a.data ?? []);
      setPremiacoes(p.data ?? []);
      setCarregando(false);
    }
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const estaEscuro = document.documentElement.classList.contains("dark");
    setDark(estaEscuro);
  }, []);

  useEffect(() => {
    async function checar() {
      const { data } = await supabase.auth.getSession();
      setLogado(!!data.session);
      setVerificandoAuth(false);
    }
    checar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const alternarTema = () => {
    const root = document.documentElement;
    const novo = !dark;
    if (novo) {
      root.classList.add("dark");
      localStorage.setItem("tema-juvenis", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("tema-juvenis", "light");
    }
    setDark(novo);
  };

  /* ----------------------- Cálculo do ranking por trimestre ------ */

  const rankingPorTrimestre = useMemo(() => {
    const resultado: Record<
      number,
      { juvenil_id: number; nome: string; total: number }[]
    > = {};

    TRIMESTRES.forEach((_, idx) => {
      const meses = TRIMESTRES[idx].meses;
      const somas: Record<number, number> = {};
      juvenis.forEach((j) => (somas[j.id] = 0));

      avaliacoes.forEach((a) => {
        const [anoStr, mesStr] = a.data_avaliacao.split("-");
        if (Number(anoStr) !== anoAtual) return;
        if (!meses.includes(Number(mesStr))) return;
        CRITERIOS.forEach((c) => {
          if (a[c]) somas[a.juvenil_id] += SISTEMA_PONTOS[c];
        });
      });

      resultado[idx] = juvenis
        .map((j) => ({ juvenil_id: j.id, nome: j.nome, total: somas[j.id] ?? 0 }))
        .filter((x) => x.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 3);
    });

    return resultado;
  }, [juvenis, avaliacoes, anoAtual]);

  /* ----------------------- Registrar premiação ------------------- */

  const registrarPremiacao = async (
    trimestre: number,
    juvenilId: number,
    colocacao: number
  ) => {
    const existente = premiacoes.find(
      (p) => p.trimestre === trimestre && p.juvenil_id === juvenilId
    );

    const nova: PremiacaoRow = {
      ano: anoAtual,
      trimestre,
      juvenil_id: juvenilId,
      colocacao,
      entregue: existente?.entregue ?? false,
      data_entrega: existente?.data_entrega ?? null,
      responsavel: existente?.responsavel ?? null,
    };

    if (existente?.id) {
      const { error } = await supabase
        .from("premiacoes")
        .update(nova)
        .eq("id", existente.id);
      if (error) {
        alert(`Erro: ${error.message}`);
        return;
      }
      setPremiacoes((prev) =>
        prev.map((p) => (p.id === existente.id ? { ...p, ...nova } : p))
      );
    } else {
      const { data, error } = await supabase
        .from("premiacoes")
        .insert(nova)
        .select()
        .single();
      if (error) {
        alert(`Erro: ${error.message}`);
        return;
      }
      setPremiacoes((prev) => [...prev, data]);
    }
  };

  const toggleEntregue = async (p: PremiacaoRow) => {
    if (!p.id) return;
    const novaData = p.entregue ? null : new Date().toISOString().slice(0, 10);

    const { error } = await supabase
      .from("premiacoes")
      .update({ entregue: !p.entregue, data_entrega: novaData })
      .eq("id", p.id);

    if (error) {
      alert(`Erro: ${error.message}`);
      return;
    }
    setPremiacoes((prev) =>
      prev.map((x) =>
        x.id === p.id
          ? { ...x, entregue: !p.entregue, data_entrega: novaData }
          : x
      )
    );
  };

  const definirResponsavel = async (p: PremiacaoRow, resp: string) => {
    if (!p.id) return;
    const { error } = await supabase
      .from("premiacoes")
      .update({ responsavel: resp })
      .eq("id", p.id);
    if (error) return;
    setPremiacoes((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, responsavel: resp } : x))
    );
  };

  /* ----------------------- UI ------------------------------------ */

  if (verificandoAuth) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950">
        <p className="text-slate-400">Verificando acesso...</p>
      </main>
    );
  }

  if (!logado) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
        <div className="rounded-2xl bg-slate-900 p-8 text-center ring-1 ring-slate-800">
          <p className="mb-4 text-slate-300">
            Você precisa estar logado para acessar esta página.
          </p>
          <a
            href="/"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            Ir para o login
          </a>
        </div>
      </main>
    );
  }

  if (carregando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <p className="text-slate-600 dark:text-slate-300">Carregando...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 transition-colors dark:bg-slate-950 dark:text-slate-100 sm:p-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 sm:text-3xl">
              🏅 Centro de Premiações {anoAtual}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Ranking e registro de entrega das premiações trimestrais
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              ← Voltar
            </Link>
            <Link
              href="/ranking"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              🏆 Ranking
            </Link>
            <button
              onClick={alternarTema}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {dark ? "☀️ Claro" : "🌙 Escuro"}
            </button>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          {TRIMESTRES.map((t, idx) => {
            const ranking = rankingPorTrimestre[idx] ?? [];
            const atual = idx === trimestreAtual();

            return (
              <div
                key={t.nome}
                className={`rounded-2xl bg-white p-5 shadow-sm ring-1 transition dark:bg-slate-900 ${
                  atual
                    ? "ring-2 ring-emerald-400 dark:ring-emerald-600"
                    : "ring-slate-200 dark:ring-slate-800"
                }`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                    {t.nome}
                  </h2>
                  {atual && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                      Em andamento
                    </span>
                  )}
                </div>

                {ranking.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Sem pontuação registrada.
                  </p>
                ) : (
                  <ol className="space-y-2">
                    {ranking.map((j, i) => {
                      const colocacao = i + 1;
                      const premio = premiacoes.find(
                        (p) =>
                          p.trimestre === idx && p.juvenil_id === j.juvenil_id
                      );

                      return (
                        <li
                          key={j.juvenil_id}
                          className="flex flex-col gap-2 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200 dark:bg-slate-800/60 dark:ring-slate-700"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2">
                              <span className="text-lg">{medalha(colocacao)}</span>
                              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                {j.nome}
                              </span>
                            </span>
                            <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                              {j.total} pts
                            </span>
                          </div>

                          {premio ? (
                            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-2 py-1.5 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
                              <button
                                onClick={() => toggleEntregue(premio)}
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${
                                  premio.entregue
                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                                }`}
                              >
                                {premio.entregue
                                  ? `✅ Entregue em ${premio.data_entrega ?? ""}`
                                  : "⏳ Pendente"}
                              </button>
                              <input
                                type="text"
                                placeholder="Responsável"
                                defaultValue={premio.responsavel ?? ""}
                                onBlur={(e) =>
                                  definirResponsavel(premio, e.target.value)
                                }
                                className="flex-1 rounded border border-slate-300 bg-transparent px-2 py-0.5 text-xs text-slate-700 dark:border-slate-600 dark:text-slate-200"
                              />
                            </div>
                          ) : (
                            <button
                              onClick={() =>
                                registrarPremiacao(idx, j.juvenil_id, colocacao)
                              }
                              className="self-start rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-emerald-700"
                            >
                              + Registrar premiação
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}