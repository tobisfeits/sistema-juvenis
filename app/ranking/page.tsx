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

export default function RankingPage() {
  const supabase = createClient();

  const [juvenis, setJuvenis] = useState<Juvenil[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<AvaliacaoRow[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [trimestre, setTrimestre] = useState(trimestreAtual());
  const [dark, setDark] = useState(false);

  useEffect(() => {
    async function carregar() {
      setCarregando(true);

      const { data: juvenisData, error: e1 } = await supabase
        .from("juvenis")
        .select("id, nome")
        .order("id");

      if (e1) {
        console.error("Erro juvenis:", e1.message, e1);
        setCarregando(false);
        return;
      }

      const { data: avaliacoesData, error: e2 } = await supabase
        .from("avaliacoes")
        .select("*");

      if (e2) {
        console.error("Erro avaliacoes:", e2.message, e2);
        setCarregando(false);
        return;
      }

      setJuvenis(juvenisData ?? []);
      setAvaliacoes(avaliacoesData ?? []);
      setCarregando(false);
    }
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const estaEscuro = document.documentElement.classList.contains("dark");
    setDark(estaEscuro);
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

  const rankingTrimestre = useMemo(() => {
    const meses = TRIMESTRES[trimestre].meses;
    const ano = new Date().getFullYear();

    const somas: Record<number, number> = {};
    juvenis.forEach((j) => (somas[j.id] = 0));

    avaliacoes.forEach((a) => {
      const [anoStr, mesStr] = a.data_avaliacao.split("-");
      if (Number(anoStr) !== ano) return;
      if (!meses.includes(Number(mesStr))) return;
      CRITERIOS.forEach((c) => {
        if (a[c]) somas[a.juvenil_id] += SISTEMA_PONTOS[c];
      });
    });

    return juvenis
      .map((j) => ({ ...j, total: somas[j.id] ?? 0 }))
      .filter((j) => j.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [juvenis, avaliacoes, trimestre]);

  const medalha = (pos: number) => {
    if (pos === 0) return "🥇";
    if (pos === 1) return "🥈";
    if (pos === 2) return "🥉";
    return `${pos + 1}º`;
  };

  if (carregando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <p className="text-slate-600 dark:text-slate-300">Carregando...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 transition-colors dark:bg-slate-950 dark:text-slate-100 sm:p-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 sm:text-3xl">
              🏆 Ranking Trimestral
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Soma dos pontos de todos os sábados do trimestre
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              ← Voltar
            </Link>
            <button
              onClick={alternarTema}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {dark ? "☀️ Claro" : "🌙 Escuro"}
            </button>
          </div>
        </header>

        <div className="mb-6 flex flex-wrap gap-2">
          {TRIMESTRES.map((t, i) => (
            <button
              key={t.nome}
              onClick={() => setTrimestre(i)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                trimestre === i
                  ? "bg-emerald-600 text-white shadow-md"
                  : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-700"
              }`}
            >
              {t.nome}
            </button>
          ))}
        </div>

        {rankingTrimestre.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-800">
            Nenhuma avaliação registrada no {TRIMESTRES[trimestre].nome}.
          </div>
        ) : (
          <ol className="space-y-3">
            {rankingTrimestre.map((j, i) => (
              <li
                key={j.id}
                className={`flex items-center justify-between rounded-2xl px-5 py-4 shadow-sm ring-1 transition ${
                  i === 0
                    ? "bg-gradient-to-r from-yellow-50 to-amber-50 ring-yellow-300 dark:from-yellow-950/40 dark:to-amber-950/40 dark:ring-yellow-700"
                    : i === 1
                      ? "bg-gradient-to-r from-slate-50 to-slate-100 ring-slate-300 dark:from-slate-800/60 dark:to-slate-800/40 dark:ring-slate-600"
                      : i === 2
                        ? "bg-gradient-to-r from-orange-50 to-amber-50 ring-orange-300 dark:from-orange-950/40 dark:to-amber-950/40 dark:ring-orange-700"
                        : "bg-white ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"
                }`}
              >
                <span className="flex items-center gap-4">
                  <span className="text-2xl font-bold">{medalha(i)}</span>
                  <span className="text-base font-semibold text-slate-800 dark:text-slate-100">
                    {j.nome}
                  </span>
                </span>
                <span className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                  {j.total} pts
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  );
}