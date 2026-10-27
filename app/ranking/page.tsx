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

function medalhaEmoji(pos: number) {
  if (pos === 0) return "🥇";
  if (pos === 1) return "🥈";
  if (pos === 2) return "🥉";
  return `${pos + 1}º`;
}

export default function RankingPage() {
  const supabase = useMemo(() => createClient(), []);

  const [juvenis, setJuvenis] = useState<Juvenil[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<AvaliacaoRow[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [trimestre, setTrimestre] = useState(trimestreAtual());
  const [dark, setDark] = useState(true);
  const [verificandoAuth, setVerificandoAuth] = useState(true);
  const [logado, setLogado] = useState(false);

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
  }, [supabase]);

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
          <p className="mb-6 text-sm text-slate-400">Você precisa estar logado para ver o ranking.</p>
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
          Carregando ranking...
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

      <div className="relative z-10 mx-auto max-w-4xl">
        {/* Header */}
        <header className="mb-6 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="bg-gradient-to-r from-white via-purple-100 to-fuchsia-200 bg-clip-text text-3xl font-black tracking-tight text-transparent sm:text-4xl">
                🏆 Ranking Trimestral
              </h1>
              <p className="mt-1 text-xs font-medium text-slate-400">
                🎯 Soma dos pontos de todos os sábados do trimestre
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/" className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 backdrop-blur transition hover:bg-white/10">
                ← Voltar
              </Link>
              <Link href="/premiacoes" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/20">
                🏅 Premiações
              </Link>
              <button onClick={alternarTema} className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 backdrop-blur transition hover:bg-white/10">
                {dark ? "☀️ Claro" : "🌙 Escuro"}
              </button>
            </div>
          </div>

          {/* Tabs de trimestre */}
          <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/5 p-2 backdrop-blur">
            {TRIMESTRES.map((t, i) => {
              const ativo = trimestre === i;
              const ehAtual = i === trimestreAtualIdx;
              return (
                <button
                  key={t.nome}
                  onClick={() => setTrimestre(i)}
                  className={`group relative flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                    ativo
                      ? "bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-lg shadow-purple-500/30"
                      : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                  }`}
                >
                  <span className="relative flex items-center justify-center gap-1.5">
                    {t.nome}
                    {ehAtual && (
                      <span className={`h-1.5 w-1.5 rounded-full ${ativo ? "bg-white" : "animate-pulse bg-emerald-400"}`} />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </header>

        {rankingTrimestre.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-12 text-center backdrop-blur">
            <div className="mb-3 text-5xl">📊</div>
            <p className="text-sm font-medium text-slate-400">
              Nenhuma avaliação registrada no {TRIMESTRES[trimestre].nome}.
            </p>
          </div>
        ) : (
          <ol className="space-y-3">
            {rankingTrimestre.map((j, i) => {
              const initials = j.nome.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
              const isTop1 = i === 0;
              const isTop2 = i === 1;
              const isTop3 = i === 2;

              const cardClasses = isTop1
                ? "border-yellow-400/40 bg-gradient-to-r from-yellow-500/15 via-amber-500/10 to-yellow-500/5 shadow-yellow-500/10 hover:shadow-yellow-500/20"
                : isTop2
                  ? "border-slate-400/30 bg-gradient-to-r from-slate-400/10 to-slate-500/5 shadow-slate-400/5 hover:shadow-slate-400/15"
                  : isTop3
                    ? "border-orange-400/30 bg-gradient-to-r from-orange-500/10 to-amber-500/5 shadow-orange-500/5 hover:shadow-orange-500/15"
                    : "border-white/10 bg-white/5 hover:border-purple-500/30 hover:bg-white/10";

              const avatarClasses = isTop1
                ? "bg-gradient-to-br from-yellow-400 to-amber-500 text-yellow-950 shadow-yellow-500/40"
                : isTop2
                  ? "bg-gradient-to-br from-slate-300 to-slate-400 text-slate-800 shadow-slate-400/30"
                  : isTop3
                    ? "bg-gradient-to-br from-orange-400 to-orange-600 text-orange-950 shadow-orange-500/40"
                    : "bg-gradient-to-br from-purple-500 to-fuchsia-500 text-white shadow-purple-500/30";

              const pointsClasses = isTop1
                ? "bg-yellow-500/20 text-yellow-200 ring-1 ring-yellow-500/30"
                : isTop2
                  ? "bg-slate-400/20 text-slate-200 ring-1 ring-slate-400/30"
                  : isTop3
                    ? "bg-orange-500/20 text-orange-200 ring-1 ring-orange-500/30"
                    : "bg-purple-500/20 text-purple-200 ring-1 ring-purple-500/30";

              return (
                <li
                  key={j.id}
                  className={`flex items-center justify-between gap-3 rounded-2xl border p-4 backdrop-blur transition hover:shadow-lg ${cardClasses}`}
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="relative">
                      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-black shadow-lg ${avatarClasses}`}>
                        {initials}
                      </div>
                      {(isTop1 || isTop2 || isTop3) && (
                        <span className="absolute -bottom-1 -right-1 text-xl drop-shadow-lg">
                          {medalhaEmoji(i)}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-100 sm:text-base">
                        {j.nome}
                      </p>
                      <p className="text-[11px] font-medium text-slate-400">
                        {i === 0 ? "🥇 1º lugar" : i === 1 ? "🥈 2º lugar" : i === 2 ? "🥉 3º lugar" : `${i + 1}º lugar`}
                      </p>
                    </div>
                  </div>
                  <div className={`shrink-0 rounded-xl px-3 py-1.5 text-sm font-black ${pointsClasses}`}>
                    {j.total} pts
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </main>
  );
}