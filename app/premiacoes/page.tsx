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

function medalhaEmoji(pos: number) {
  if (pos === 1) return "🥇";
  if (pos === 2) return "🥈";
  if (pos === 3) return "🥉";
  return `${pos}º`;
}

export default function PremiacoesPage() {
  const supabase = useMemo(() => createClient(), []);

  const [juvenis, setJuvenis] = useState<Juvenil[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<AvaliacaoRow[]>([]);
  const [premiacoes, setPremiacoes] = useState<PremiacaoRow[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [dark, setDark] = useState(true);
  const [verificandoAuth, setVerificandoAuth] = useState(true);
  const [logado, setLogado] = useState(false);

  const anoAtual = new Date().getFullYear();

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
  }, [supabase, anoAtual]);

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
  }, [supabase]);

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

  if (verificandoAuth) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="flex items-center gap-3 text-slate-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-purple-500/30 border-t-purple-400" />
          Verificando acesso...
        </div>
      </main>
    );
  }

  if (!logado) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-4">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 animate-pulse rounded-full bg-purple-600/20 blur-3xl" />
          <div className="absolute -bottom-32 right-1/4 h-80 w-80 animate-pulse rounded-full bg-fuchsia-600/15 blur-3xl" style={{ animationDelay: "1.5s" }} />
        </div>
        <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-gradient-to-b from-slate-900/90 to-slate-950/90 p-8 text-center shadow-2xl backdrop-blur-xl">
          <div className="mb-4 text-5xl">🔒</div>
          <h1 className="mb-2 text-xl font-black text-slate-100">Acesso restrito</h1>
          <p className="mb-6 text-sm text-slate-400">Você precisa estar logado para ver as premiações.</p>
          <Link href="/" className="inline-block rounded-2xl bg-gradient-to-r from-purple-600 to-fuchsia-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-purple-500/30 transition hover:scale-[1.02] hover:shadow-xl">
            Ir para o login →
          </Link>
        </div>
      </main>
    );
  }

  if (carregando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="flex items-center gap-3 text-slate-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-purple-500/30 border-t-purple-400" />
          Carregando premiações...
        </div>
      </main>
    );
  }

  const trimestreAtualIdx = trimestreAtual();

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 p-4 text-slate-100 sm:p-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-purple-600/10 blur-3xl" />
        <div className="absolute top-1/2 -right-40 h-96 w-96 rounded-full bg-fuchsia-600/10 blur-3xl" />
      </div>
      <div className="pointer-events-none absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "28px 28px" }} />

      <div className="relative z-10 mx-auto max-w-6xl">
        <header className="mb-6 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="bg-gradient-to-r from-white via-purple-100 to-fuchsia-200 bg-clip-text text-3xl font-black tracking-tight text-transparent sm:text-4xl">
                🏅 Centro de Premiações {anoAtual}
              </h1>
              <p className="mt-1 text-xs font-medium text-slate-400">
                🎯 Ranking e registro de entrega das premiações trimestrais
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/" className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 backdrop-blur transition hover:bg-white/10">
                ← Voltar
              </Link>
              <Link href="/ranking" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20">
                🏆 Ranking
              </Link>
              <button onClick={alternarTema} className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 backdrop-blur transition hover:bg-white/10">
                {dark ? "☀️ Claro" : "🌙 Escuro"}
              </button>
            </div>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          {TRIMESTRES.map((t, idx) => {
            const ranking = rankingPorTrimestre[idx] ?? [];
            const atual = idx === trimestreAtualIdx;

            return (
              <div
                key={t.nome}
                className={`relative overflow-hidden rounded-3xl border p-5 backdrop-blur transition ${
                  atual
                    ? "border-purple-500/40 bg-gradient-to-br from-purple-500/10 to-fuchsia-500/5 shadow-lg shadow-purple-500/10"
                    : "border-white/10 bg-white/5"
                }`}
              >
                {atual && (
                  <div className="absolute -top-px left-1/2 h-px w-3/4 -translate-x-1/2 bg-gradient-to-r from-transparent via-purple-400 to-transparent" />
                )}

                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📅</span>
                    <h2 className="text-base font-black text-slate-100">{t.nome}</h2>
                  </div>
                  {atual && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold text-emerald-300">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                      Em andamento
                    </span>
                  )}
                </div>

                {ranking.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
                    <p className="text-xs font-medium text-slate-500">
                      Sem pontuação registrada.
                    </p>
                  </div>
                ) : (
                  <ol className="space-y-2">
                    {ranking.map((j, i) => {
                      const colocacao = i + 1;
                      const premio = premiacoes.find(
                        (p) =>
                          p.trimestre === idx && p.juvenil_id === j.juvenil_id
                      );

                      const isTop1 = colocacao === 1;
                      const isTop2 = colocacao === 2;
                      const isTop3 = colocacao === 3;

                      const cardClasses = isTop1
                        ? "border-yellow-400/30 bg-gradient-to-r from-yellow-500/10 to-amber-500/5"
                        : isTop2
                          ? "border-slate-400/20 bg-gradient-to-r from-slate-400/5 to-slate-500/5"
                          : isTop3
                            ? "border-orange-400/20 bg-gradient-to-r from-orange-500/5 to-amber-500/5"
                            : "border-white/10 bg-white/5";

                      return (
                        <li
                          key={j.juvenil_id}
                          className={`flex flex-col gap-2 rounded-2xl border p-3 transition ${cardClasses}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="shrink-0 text-lg">
                                {medalhaEmoji(colocacao)}
                              </span>
                              <span className="truncate text-sm font-bold text-slate-100">
                                {j.nome}
                              </span>
                            </span>
                            <span className={`shrink-0 rounded-xl px-2.5 py-1 text-xs font-black ${
                              isTop1
                                ? "bg-yellow-500/20 text-yellow-200"
                                : isTop2
                                  ? "bg-slate-400/20 text-slate-200"
                                  : "bg-orange-500/20 text-orange-200"
                            }`}>
                              {j.total} pts
                            </span>
                          </div>

                          {premio ? (
                            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-slate-950/50 px-2.5 py-2">
                              <button
                                onClick={() => toggleEntregue(premio)}
                                className={`rounded-lg px-2.5 py-1 text-[10px] font-bold transition ${
                                  premio.entregue
                                    ? "border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                                    : "border border-amber-500/30 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
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
                                onBlur={(e) => definirResponsavel(premio, e.target.value)}
                                className="flex-1 min-w-0 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 outline-none transition focus:border-purple-400 focus:bg-white/10 focus:ring-2 focus:ring-purple-500/20"
                              />
                            </div>
                          ) : (
                            <button
                              onClick={() => registrarPremiacao(idx, j.juvenil_id, colocacao)}
                              className="self-start rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 px-3 py-1.5 text-[10px] font-bold text-white shadow-lg shadow-purple-500/20 transition hover:scale-[1.02] hover:shadow-xl hover:shadow-fuchsia-500/30 active:scale-[0.98]"
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