"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

/* ------------------------------------------------------------------ */
/*  Constantes de inatividade                                         */
/* ------------------------------------------------------------------ */

const TEMPO_INATIVIDADE_MS = 5 * 60 * 1000; // 5 minutos
const TEMPO_AVISO_MS = 1 * 60 * 1000; // Aviso 1 minuto antes

/* ------------------------------------------------------------------ */
/*  Tipos e constantes                                                */
/* ------------------------------------------------------------------ */

type Juvenil = {
  id: number;
  nome: string;
  aniversario_dia: number | null;
  aniversario_mes: number | null;
  ativo: boolean | null;
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

const PONTUACAO_MAXIMA = CRITERIOS.reduce(
  (soma, c) => soma + SISTEMA_PONTOS[c],
  0
);

const LABEL: Record<Criterio, string> = {
  presenca: "Presença",
  pontualidade: "Pontualidade",
  participacao: "Participação",
  estudo_licao: "Estudo da Lição",
  verso_aureo: "Verso Áureo",
  biblia: "Bíblia",
};

type AvaliacaoRow = {
  id?: number;
  juvenil_id: number;
  data_avaliacao: string;
  presenca: boolean;
  pontualidade: boolean;
  participacao: boolean;
  estudo_licao: boolean;
  verso_aureo: boolean;
  biblia: boolean;
};

type Profile = {
  id: string;
  nome: string;
  email: string;
  username: string | null;
  must_change_password: boolean;
};

function semId<T extends { id?: number }>(obj: T): Omit<T, "id"> {
  const { id: _ignorar, ...resto } = obj;
  return resto;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function hojeISO(): string {
  const d = new Date();
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function formatarDataBR(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function aniversarioNaSemana(dia: number | null, mes: number | null): boolean {
  if (!dia || !mes) return false;
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const aniversario = new Date(anoAtual, mes - 1, dia);
  if (aniversario < hoje && aniversario.toDateString() !== hoje.toDateString()) {
    aniversario.setFullYear(anoAtual + 1);
  }
  const diffDias = Math.ceil(
    (aniversario.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)
  );
  return diffDias >= 0 && diffDias <= 7;
}

function ehAniversarioHoje(dia: number | null, mes: number | null): boolean {
  if (!dia || !mes) return false;
  const hoje = new Date();
  return hoje.getDate() === dia && hoje.getMonth() + 1 === mes;
}

function ehAniversarioNoMes(dia: number | null, mes: number | null): boolean {
  if (!dia || !mes) return false;
  const hoje = new Date();
  return hoje.getMonth() + 1 === mes;
}

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

function calcularTotalLinha(row: AvaliacaoRow): number {
  return CRITERIOS.reduce((soma, c) => {
    return soma + (row[c] ? SISTEMA_PONTOS[c] : 0);
  }, 0);
}

/* ------------------------------------------------------------------ */
/*  Validação de senha forte                                          */
/* ------------------------------------------------------------------ */

function validarSenha(senha: string, nomeUsuario: string) {
  const erros: string[] = [];
  if (senha.length < 8) erros.push("Mínimo de 8 caracteres");
  if (!/[A-Z]/.test(senha)) erros.push("Pelo menos 1 letra MAIÚSCULA");
  if (!/[a-z]/.test(senha)) erros.push("Pelo menos 1 letra minúscula");
  if (!/[0-9]/.test(senha)) erros.push("Pelo menos 1 número");
  if (!/[^A-Za-z0-9]/.test(senha)) erros.push("Pelo menos 1 caractere especial");
  if (nomeUsuario && senha.toLowerCase().includes(nomeUsuario.toLowerCase()))
    erros.push("Não pode conter seu nome");
  return erros;
}

/* ------------------------------------------------------------------ */
/*  Medalhas                                                          */
/* ------------------------------------------------------------------ */

type Medalha = {
  emoji: string;
  nome: string;
  descricao: string;
};

function calcularMedalhas(avaliacoes: AvaliacaoRow[]): Medalha[] {
  const medalhas: Medalha[] = [];
  if (avaliacoes.length === 0) return medalhas;

  const total = avaliacoes.length;
  const presencas = avaliacoes.filter((a) => a.presenca).length;

  if (presencas >= 1) {
    medalhas.push({
      emoji: "⭐",
      nome: "Primeira Presença",
      descricao: "Compareceu pela primeira vez",
    });
  }

  if (presencas >= 4 && presencas === total) {
    medalhas.push({
      emoji: "🔥",
      nome: "Assíduo",
      descricao: `${presencas} sábados sem faltar`,
    });
  }

  const perfeitos = avaliacoes.filter(
    (a) => calcularTotalLinha(a) === PONTUACAO_MAXIMA
  ).length;
  if (perfeitos >= 1) {
    medalhas.push({
      emoji: "🏆",
      nome: "Sábado Perfeito",
      descricao: `${perfeitos}x com 100 pontos`,
    });
  }

  const comPresenca = avaliacoes.filter((a) => a.presenca);
  if (comPresenca.length >= 3) {
    const taxaEstudo =
      comPresenca.filter((a) => a.estudo_licao).length / comPresenca.length;
    if (taxaEstudo >= 0.8) {
      medalhas.push({
        emoji: "📖",
        nome: "Mestre da Lição",
        descricao: "80%+ em Estudo da Lição",
      });
    }

    const taxaBiblia =
      comPresenca.filter((a) => a.biblia).length / comPresenca.length;
    if (taxaBiblia >= 0.8) {
      medalhas.push({
        emoji: "📚",
        nome: "Conhecedor da Bíblia",
        descricao: "80%+ trazendo Bíblia",
      });
    }

    const taxaPontual =
      comPresenca.filter((a) => a.pontualidade).length / comPresenca.length;
    if (taxaPontual >= 0.9) {
      medalhas.push({
        emoji: "⏰",
        nome: "Sem Atrasos",
        descricao: "90%+ de pontualidade",
      });
    }
  }

  return medalhas;
}

/* ================================================================== */
/*  TELA DE LOGIN                                                     */
/* ================================================================== */

function LoginScreen() {
  const supabase = createClient();
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    setCarregando(true);

    const emailCompleto = usuario.includes("@")
      ? usuario.trim()
      : `${usuario.trim().toLowerCase()}@soul.local`;

    const { error } = await supabase.auth.signInWithPassword({
      email: emailCompleto,
      password: senha,
    });

    if (error) {
      setErro("Usuário ou senha incorretos.");
      setCarregando(false);
      return;
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-md">
        <div className="animate-fade-in mb-8 flex justify-center">
          <Image
            src="/soul-em-cristo.png"
            alt="Soul em Cristo"
            width={360}
            height={200}
            className="h-auto w-full max-w-xs drop-shadow-2xl"
            priority
          />
        </div>

        <div className="animate-fade-in-lento rounded-2xl bg-slate-900 p-6 shadow-2xl ring-1 ring-slate-800">
          <h1 className="mb-1 text-center text-2xl font-bold text-slate-100">
            Bem-vindo(a) 👋
          </h1>
          <p className="mb-6 text-center text-sm text-slate-400">
            Faça login para acessar o sistema
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">
                Usuário
              </label>
              <input
                type="text"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                placeholder="bianca, cleide ou tobias"
                autoComplete="username"
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-slate-100 outline-none transition focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">
                Senha
              </label>
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Digite sua senha"
                autoComplete="current-password"
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-slate-100 outline-none transition focus:border-emerald-500"
              />
            </div>

            {erro && (
              <div className="rounded-lg bg-red-950/40 px-3 py-2 text-sm text-red-300 ring-1 ring-red-900">
                {erro}
              </div>
            )}

            <button
              type="submit"
              disabled={carregando}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white shadow-lg transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {carregando ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>

        <p className="animate-fade-in-bem-lento mt-6 text-center text-xs text-slate-500">
          Sistema de Avaliação de Juvenis • Soul em Cristo
        </p>
      </div>
    </main>
  );
}

/* ================================================================== */
/*  TELA DE TROCA OBRIGATÓRIA DE SENHA                                */
/* ================================================================== */

function TrocarSenhaScreen({ profile }: { profile: Profile }) {
  const supabase = createClient();
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const primeiroNome = profile.nome.split(" ")[0];
  const erros = validarSenha(novaSenha, primeiroNome);
  const senhaValida = novaSenha.length > 0 && erros.length === 0;
  const senhasIguais = novaSenha === confirmar && confirmar.length > 0;

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");

    if (!senhaValida) {
      setErro("A senha ainda não cumpre todos os requisitos.");
      return;
    }
    if (!senhasIguais) {
      setErro("As senhas não coincidem.");
      return;
    }

    setCarregando(true);

    const { error: errorAuth } = await supabase.auth.updateUser({
      password: novaSenha,
    });

    if (errorAuth) {
      setErro("Erro ao salvar: " + errorAuth.message);
      setCarregando(false);
      return;
    }

    const { error: errorProfile } = await supabase
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", profile.id);

    if (errorProfile) {
      setErro("Erro ao atualizar perfil: " + errorProfile.message);
      setCarregando(false);
      return;
    }

    window.location.reload();
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-lg">
        <div className="animate-fade-in mb-6 flex justify-center">
          <Image
            src="/soul-em-cristo.png"
            alt="Soul em Cristo"
            width={280}
            height={160}
            className="h-auto w-full max-w-[200px] drop-shadow-2xl"
          />
        </div>

        <div className="animate-fade-in-lento rounded-2xl bg-slate-900 p-6 shadow-2xl ring-1 ring-slate-800">
          <div className="mb-5 rounded-lg bg-amber-950/40 px-4 py-3 text-sm text-amber-200 ring-1 ring-amber-800">
            ⚠️ <strong>Primeiro acesso.</strong> Você precisa criar uma senha
            pessoal antes de continuar.
          </div>

          <h1 className="mb-1 text-xl font-bold text-slate-100">
            Olá, {primeiroNome}!
          </h1>
          <p className="mb-5 text-sm text-slate-400">
            Crie uma senha única e pessoal. Ninguém mais saberá ela.
          </p>

          <form onSubmit={handleSalvar} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">
                Nova senha
              </label>
              <input
                type="password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="Digite sua nova senha"
                autoComplete="new-password"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-slate-100 outline-none transition focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">
                Confirmar nova senha
              </label>
              <input
                type="password"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                placeholder="Repita a senha"
                autoComplete="new-password"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-slate-100 outline-none transition focus:border-emerald-500"
              />
            </div>

            <div className="rounded-lg bg-slate-800/60 p-3 ring-1 ring-slate-700">
              <p className="mb-2 text-xs font-semibold text-slate-300">
                Requisitos da senha:
              </p>
              <ul className="space-y-1 text-xs">
                {[
                  { ok: novaSenha.length >= 8, txt: "Mínimo 8 caracteres" },
                  { ok: /[A-Z]/.test(novaSenha), txt: "1 letra maiúscula" },
                  { ok: /[a-z]/.test(novaSenha), txt: "1 letra minúscula" },
                  { ok: /[0-9]/.test(novaSenha), txt: "1 número" },
                  {
                    ok: /[^A-Za-z0-9]/.test(novaSenha),
                    txt: "1 caractere especial (@, #, $, ...)",
                  },
                  {
                    ok:
                      novaSenha.length > 0 &&
                      !novaSenha
                        .toLowerCase()
                        .includes(primeiroNome.toLowerCase()),
                    txt: `Não pode conter seu nome (${primeiroNome})`,
                  },
                ].map((r) => (
                  <li
                    key={r.txt}
                    className={`flex items-center gap-2 ${
                      r.ok ? "text-emerald-400" : "text-slate-500"
                    }`}
                  >
                    <span>{r.ok ? "✓" : "○"}</span>
                    <span>{r.txt}</span>
                  </li>
                ))}
              </ul>
            </div>

            {erro && (
              <div className="rounded-lg bg-red-950/40 px-3 py-2 text-sm text-red-300 ring-1 ring-red-900">
                {erro}
              </div>
            )}

            <button
              type="submit"
              disabled={carregando || !senhaValida || !senhasIguais}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white shadow-lg transition hover:bg-emerald-700 disabled:opacity-40"
            >
              {carregando ? "Salvando..." : "Salvar nova senha"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

/* ================================================================== */
/*  SKELETON DE CARREGAMENTO                                          */
/* ================================================================== */

function SkeletonScreen() {
  return (
    <main className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="h-16 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800"
            />
          ))}
        </div>
        <div className="h-16 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
        <div className="space-y-3 sm:hidden">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800"
            />
          ))}
        </div>
        <div className="hidden sm:block">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="mb-2 h-14 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800"
            />
          ))}
        </div>
      </div>
    </main>
  );
}

/* ================================================================== */
/*  MODAL: CADASTRAR NOVO JUVENIL                                     */
/* ================================================================== */

function ModalNovoJuvenil({
  onFechar,
  onSalvo,
}: {
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const supabase = createClient();
  const [nome, setNome] = useState("");
  const [dia, setDia] = useState("");
  const [mes, setMes] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");

    if (nome.trim().length < 3) {
      setErro("Digite o nome completo do juvenil.");
      return;
    }

    const diaNum = Number(dia);
    const mesNum = Number(mes);

    if (dia && (diaNum < 1 || diaNum > 31)) {
      setErro("Dia do aniversário deve ser entre 1 e 31.");
      return;
    }
    if (mes && (mesNum < 1 || mesNum > 12)) {
      setErro("Mês do aniversário deve ser entre 1 e 12.");
      return;
    }

    setSalvando(true);

    const { error } = await supabase.from("juvenis").insert({
      nome: nome.trim(),
      aniversario_dia: dia ? diaNum : null,
      aniversario_mes: mes ? mesNum : null,
      ativo: true,
    });

    if (error) {
      console.error("Erro ao cadastrar juvenil:", error);
      setErro("Erro ao salvar: " + error.message);
      setSalvando(false);
      return;
    }

    onSalvo();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      onClick={onFechar}
    >
      <div
        className="my-8 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              ✨ Novo Juvenil
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Cadastre um novo membro da classe
            </p>
          </div>
          <button
            onClick={onFechar}
            className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSalvar} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Nome completo
            </label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Maria Clara Santos"
              autoFocus
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-800 outline-none transition focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Aniversário (opcional)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="31"
                value={dia}
                onChange={(e) => setDia(e.target.value)}
                placeholder="DD"
                className="w-20 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-center text-slate-800 outline-none transition focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <span className="text-slate-500">/</span>
              <input
                type="number"
                min="1"
                max="12"
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                placeholder="MM"
                className="w-20 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-center text-slate-800 outline-none transition focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <span className="text-xs text-slate-500">dia / mês</span>
            </div>
          </div>

          {erro && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900">
              {erro}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onFechar}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {salvando ? "Salvando..." : "Cadastrar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  MODAL: GERENCIAR JUVENIS                                          */
/* ================================================================== */

function ModalGerenciarJuvenis({
  juvenis,
  onFechar,
  onAtualizado,
}: {
  juvenis: Juvenil[];
  onFechar: () => void;
  onAtualizado: () => void;
}) {
  const supabase = createClient();
  const [processando, setProcessando] = useState<number | null>(null);

  const alternarAtivo = async (j: Juvenil) => {
    const novoStatus = !j.ativo;
    const msg = novoStatus
      ? `Reativar ${j.nome}?`
      : `Inativar ${j.nome}? Ele(a) sairá da listagem, mas todo o histórico será preservado.`;

    if (!confirm(msg)) return;

    setProcessando(j.id);

    const { error } = await supabase
      .from("juvenis")
      .update({ ativo: novoStatus })
      .eq("id", j.id);

    setProcessando(null);

    if (error) {
      alert("Erro ao atualizar: " + error.message);
      return;
    }

    onAtualizado();
  };

  const ativos = juvenis.filter((j) => j.ativo !== false);
  const inativos = juvenis.filter((j) => j.ativo === false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      onClick={onFechar}
    >
      <div
        className="my-8 w-full max-w-2xl rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-200 p-5 dark:border-slate-700">
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              ⚙️ Gerenciar Juvenis
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Inative quem saiu da classe ou reative quem voltou
            </p>
          </div>
          <button
            onClick={onFechar}
            className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5">
          <section className="mb-6">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              ✅ Ativos ({ativos.length})
            </h3>
            <ul className="space-y-2">
              {ativos.map((j) => (
                <li
                  key={j.id}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200 dark:bg-slate-800/60 dark:ring-slate-700"
                >
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {j.nome}
                  </span>
                  <button
                    onClick={() => alternarAtivo(j)}
                    disabled={processando === j.id}
                    className="rounded-md bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-200 disabled:opacity-50 dark:bg-red-950/50 dark:text-red-300 dark:hover:bg-red-900/60"
                  >
                    {processando === j.id ? "..." : "Inativar"}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {inativos.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                💤 Inativos ({inativos.length})
              </h3>
              <ul className="space-y-2">
                {inativos.map((j) => (
                  <li
                    key={j.id}
                    className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 ring-1 ring-slate-200 opacity-80 dark:bg-slate-800/40 dark:ring-slate-700"
                  >
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                      {j.nome}
                    </span>
                    <button
                      onClick={() => alternarAtivo(j)}
                      disabled={processando === j.id}
                      className="rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-200 disabled:opacity-50 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
                    >
                      {processando === j.id ? "..." : "Reativar"}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {inativos.length === 0 && (
            <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
              Nenhum juvenil inativo no momento.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  MODAL: AVISO DE INATIVIDADE                                       */
/* ================================================================== */

function ModalAvisoInatividade({
  segundos,
  onContinuar,
}: {
  segundos: number;
  onContinuar: () => void;
}) {
  const minutos = Math.floor(segundos / 60);
  const seg = segundos % 60;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
        <div className="mb-3 text-5xl">⏰</div>
        <h2 className="mb-2 text-xl font-bold text-slate-800 dark:text-slate-100">
          Você ainda está aí?
        </h2>
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
          Por segurança, vamos encerrar sua sessão por inatividade em:
        </p>
        <div className="mb-5 text-3xl font-bold text-amber-600 dark:text-amber-400">
          {String(minutos).padStart(2, "0")}:{String(seg).padStart(2, "0")}
        </div>
        <button
          onClick={onContinuar}
          className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white shadow-lg transition hover:bg-emerald-700"
        >
          ✅ Continuar conectado
        </button>
        <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-500">
          Se não houver interação, você será desconectado automaticamente.
        </p>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  COMPONENTE PRINCIPAL                                              */
/* ================================================================== */

export default function Home() {
  const supabase = createClient();

  const [carregandoAuth, setCarregandoAuth] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [juvenis, setJuvenis] = useState<Juvenil[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<Record<number, AvaliacaoRow>>({});
  const [todasAvaliacoes, setTodasAvaliacoes] = useState<AvaliacaoRow[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [dark, setDark] = useState(true);
  const [dataSelecionada, setDataSelecionada] = useState<string>(hojeISO());
  const [juvenilAberto, setJuvenilAberto] = useState<Juvenil | null>(null);

  const [modalNovoAberto, setModalNovoAberto] = useState(false);
  const [modalGerenciarAberto, setModalGerenciarAberto] = useState(false);

  // Controle de inatividade
  const [mostrarAvisoInatividade, setMostrarAvisoInatividade] = useState(false);
  const [segundosRestantes, setSegundosRestantes] = useState(
    Math.floor(TEMPO_AVISO_MS / 1000)
  );
  const ultimaAtividade = useRef(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Refs para evitar conflitos de concorrência
  const avaliacoesRef = useRef<Record<number, AvaliacaoRow>>({});
  const timeouts = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const camposPendentes = useRef<Record<number, Set<Criterio>>>({});

  // Mantém avaliacoesRef sincronizado
  useEffect(() => {
    avaliacoesRef.current = avaliacoes;
  }, [avaliacoes]);

  /* ----------------------- Auth ---------------------------- */

  useEffect(() => {
    let ativo = true;

    async function verificar() {
      const { data } = await supabase.auth.getSession();
      if (!ativo) return;

      if (data.session?.user) {
        setUserId(data.session.user.id);
      } else {
        setCarregandoAuth(false);
      }
    }

    verificar();

    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (session?.user) {
          setUserId(session.user.id);
        } else {
          setUserId(null);
          setProfile(null);
          setCarregandoAuth(false);
        }
      }
    );

    return () => {
      ativo = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!userId) return;

    async function carregarProfile() {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome, email, username, must_change_password")
        .eq("id", userId)
        .single();

      if (error || !data) {
        console.error("Erro ao carregar perfil:", error);
        setCarregandoAuth(false);
        return;
      }

      await supabase
        .from("profiles")
        .update({ ultimo_login: new Date().toISOString() })
        .eq("id", userId);

      setProfile(data as Profile);
      setCarregandoAuth(false);
    }

    carregarProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const fazerLogout = async () => {
    if (!confirm("Deseja realmente sair?")) return;
    await supabase.auth.signOut();
    setProfile(null);
    setUserId(null);
  };

  /* ----------------------- Auto-logout por inatividade ------------ */

  useEffect(() => {
    if (!profile || profile.must_change_password) return;

    const registrarAtividade = () => {
      ultimaAtividade.current = Date.now();
      setMostrarAvisoInatividade(false);
      setSegundosRestantes(Math.floor(TEMPO_AVISO_MS / 1000));
    };

    const eventos = [
      "mousedown",
      "mousemove",
      "keydown",
      "scroll",
      "touchstart",
      "click",
    ];

    eventos.forEach((evento) =>
      window.addEventListener(evento, registrarAtividade, { passive: true })
    );

    intervalRef.current = setInterval(() => {
      const inativo = Date.now() - ultimaAtividade.current;

      if (inativo >= TEMPO_INATIVIDADE_MS) {
        supabase.auth.signOut().then(() => {
          setProfile(null);
          setUserId(null);
        });
      } else if (inativo >= TEMPO_INATIVIDADE_MS - TEMPO_AVISO_MS) {
        setMostrarAvisoInatividade(true);
        const restante = Math.floor((TEMPO_INATIVIDADE_MS - inativo) / 1000);
        setSegundosRestantes(restante);
      } else {
        setMostrarAvisoInatividade(false);
      }
    }, 10000);

    return () => {
      eventos.forEach((evento) =>
        window.removeEventListener(evento, registrarAtividade)
      );
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  /* ----------------------- Carregar dados ------------------------- */

  const carregarJuvenis = async () => {
    const { data } = await supabase
      .from("juvenis")
      .select("id, nome, aniversario_dia, aniversario_mes, ativo")
      .order("id");
    setJuvenis(data ?? []);
  };

  useEffect(() => {
    if (!profile || profile.must_change_password) return;
    carregarJuvenis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  useEffect(() => {
    if (!profile || profile.must_change_password) return;

    async function carregarRecentes() {
      const seisMesesAtras = new Date();
      seisMesesAtras.setMonth(seisMesesAtras.getMonth() - 6);
      const dataCorte = seisMesesAtras.toISOString().slice(0, 10);

      const { data } = await supabase
        .from("avaliacoes")
        .select("*")
        .gte("data_avaliacao", dataCorte);

      setTodasAvaliacoes(data ?? []);
    }
    carregarRecentes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  useEffect(() => {
    if (!profile || profile.must_change_password) return;

    async function carregarAvaliacoes() {
      setCarregando(true);

      const { data, error } = await supabase
        .from("avaliacoes")
        .select("*")
        .eq("data_avaliacao", dataSelecionada);

      if (error) {
        console.error("Erro ao buscar avaliações:", error.message, error);
        setCarregando(false);
        return;
      }

      const mapa: Record<number, AvaliacaoRow> = {};
      (data ?? []).forEach((row: AvaliacaoRow) => {
        mapa[row.juvenil_id] = row;
      });
      setAvaliacoes(mapa);
      setCarregando(false);
    }

    carregarAvaliacoes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSelecionada, profile]);

  /* ----------------------- Lista de juvenis ativos --------------- */

  const juvenisAtivos = useMemo(
    () => juvenis.filter((j) => j.ativo !== false),
    [juvenis]
  );

  /* ----------------------- Alternar critério ---------------------- */
  /* NOVO: envia apenas o campo alterado — evita conflito entre usuários */

  const alternarCriterio = (juvenilId: number, criterio: Criterio) => {
    const rowAtual = avaliacoes[juvenilId];

    const base: AvaliacaoRow =
      rowAtual ?? {
        juvenil_id: juvenilId,
        data_avaliacao: dataSelecionada,
        presenca: false,
        pontualidade: false,
        participacao: false,
        estudo_licao: false,
        verso_aureo: false,
        biblia: false,
      };

    const isPresenca = criterio === "presenca";
    const temPresenca = base.presenca;
    const statusAtual = base[criterio];

    if (!isPresenca && !temPresenca) return;

    let novaRow: AvaliacaoRow;
    const camposMudados: Criterio[] = [];

    if (isPresenca && statusAtual) {
      // Desmarcar presença: zera TUDO (intencional)
      novaRow = {
        ...base,
        presenca: false,
        pontualidade: false,
        participacao: false,
        estudo_licao: false,
        verso_aureo: false,
        biblia: false,
      };
      camposMudados.push(
        "presenca",
        "pontualidade",
        "participacao",
        "estudo_licao",
        "verso_aureo",
        "biblia"
      );
    } else {
      novaRow = { ...base, [criterio]: !statusAtual };
      camposMudados.push(criterio);
    }

    setAvaliacoes((prev) => ({ ...prev, [juvenilId]: novaRow }));

    // Acumula os campos que precisam ser salvos
    if (!camposPendentes.current[juvenilId]) {
      camposPendentes.current[juvenilId] = new Set();
    }
    camposMudados.forEach((c) =>
      camposPendentes.current[juvenilId].add(c)
    );

    // Cancela timeout anterior e agenda novo
    if (timeouts.current[juvenilId]) {
      clearTimeout(timeouts.current[juvenilId]);
    }

    timeouts.current[juvenilId] = setTimeout(async () => {
      const camposParaSalvar = camposPendentes.current[juvenilId];
      const rowFinal = avaliacoesRef.current[juvenilId];

      if (!camposParaSalvar || !rowFinal) return;

      // Monta objeto apenas com os campos alterados
      const updateParcial: Record<string, boolean> = {};
      camposParaSalvar.forEach((c) => {
        updateParcial[c] = rowFinal[c];
      });

      // PASSO 1: garante que a linha existe (sem sobrescrever nada)
      await supabase.from("avaliacoes").upsert(
        {
          juvenil_id: juvenilId,
          data_avaliacao: dataSelecionada,
        },
        {
          onConflict: "data_avaliacao,juvenil_id",
          ignoreDuplicates: true,
        }
      );

      // PASSO 2: atualiza APENAS os campos alterados
      const { error } = await supabase
        .from("avaliacoes")
        .update(updateParcial)
        .eq("juvenil_id", juvenilId)
        .eq("data_avaliacao", dataSelecionada);

      if (error) {
        console.error("Erro ao salvar avaliação:", error.message, error);
      }

      delete camposPendentes.current[juvenilId];
      delete timeouts.current[juvenilId];
    }, 600);
  };

  /* ----------------------- Alternar todos presentes --------------- */

  const todosPresentes = useMemo(() => {
    if (juvenisAtivos.length === 0) return false;
    return juvenisAtivos.every((j) => avaliacoes[j.id]?.presenca === true);
  }, [juvenisAtivos, avaliacoes]);

  const alternarTodosPresentes = async () => {
    const acao = todosPresentes
      ? "DESMARCAR a presença de TODOS"
      : "marcar presença de TODOS";
    const confirmar = confirm(`Deseja ${acao} os juvenis ativos neste sábado?`);
    if (!confirmar) return;

    const ids = juvenisAtivos.map((j) => j.id);

    if (ids.length === 0) return;

    // Atualiza estado local otimista
    const novoMapa: Record<number, AvaliacaoRow> = { ...avaliacoes };
    juvenisAtivos.forEach((j) => {
      const anterior = avaliacoes[j.id];
      if (todosPresentes) {
        novoMapa[j.id] = {
          ...(anterior ?? {
            juvenil_id: j.id,
            data_avaliacao: dataSelecionada,
            pontualidade: false,
            participacao: false,
            estudo_licao: false,
            verso_aureo: false,
            biblia: false,
          }),
          juvenil_id: j.id,
          data_avaliacao: dataSelecionada,
          presenca: false,
          pontualidade: false,
          participacao: false,
          estudo_licao: false,
          verso_aureo: false,
          biblia: false,
        };
      } else {
        novoMapa[j.id] = {
          ...(anterior ?? {
            juvenil_id: j.id,
            data_avaliacao: dataSelecionada,
            pontualidade: false,
            participacao: false,
            estudo_licao: false,
            verso_aureo: false,
            biblia: false,
          }),
          juvenil_id: j.id,
          data_avaliacao: dataSelecionada,
          presenca: true,
        };
      }
    });
    setAvaliacoes(novoMapa);

    // PASSO 1: garante que todas as linhas existem
    await supabase.from("avaliacoes").upsert(
      juvenisAtivos.map((j) => ({
        juvenil_id: j.id,
        data_avaliacao: dataSelecionada,
      })),
      {
        onConflict: "data_avaliacao,juvenil_id",
        ignoreDuplicates: true,
      }
    );

    // PASSO 2: atualiza apenas as colunas apropriadas
    if (todosPresentes) {
      const { error } = await supabase
        .from("avaliacoes")
        .update({
          presenca: false,
          pontualidade: false,
          participacao: false,
          estudo_licao: false,
          verso_aureo: false,
          biblia: false,
        })
        .eq("data_avaliacao", dataSelecionada)
        .in("juvenil_id", ids);

      if (error) {
        console.error("Erro ao desmarcar todos:", error.message, error);
      }
    } else {
      const { error } = await supabase
        .from("avaliacoes")
        .update({ presenca: true })
        .eq("data_avaliacao", dataSelecionada)
        .in("juvenil_id", ids);

      if (error) {
        console.error("Erro ao marcar todos:", error.message, error);
      }
    }

    // Recarrega do banco para pegar o estado real
    const { data } = await supabase
      .from("avaliacoes")
      .select("*")
      .eq("data_avaliacao", dataSelecionada);

    const mapa: Record<number, AvaliacaoRow> = {};
    (data ?? []).forEach((row: AvaliacaoRow) => {
      mapa[row.juvenil_id] = row;
    });
    setAvaliacoes(mapa);

    setTodasAvaliacoes((prev) => {
      const filtradas = prev.filter(
        (a) => a.data_avaliacao !== dataSelecionada
      );
      return [...filtradas, ...(data ?? [])];
    });
  };

  /* ----------------------- Cálculo de total ---------------------- */

  const calcularTotal = (juvenilId: number): number => {
    const row = avaliacoes[juvenilId];
    if (!row) return 0;
    return calcularTotalLinha(row);
  };

  /* ----------------------- Derivados ----------------------------- */

  const ranking = useMemo(() => {
    return juvenisAtivos
      .map((j) => ({ ...j, total: calcularTotal(j.id) }))
      .filter((j) => j.total > 0)
      .sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avaliacoes, juvenisAtivos]);

  const presentes = useMemo(
    () => juvenisAtivos.filter((j) => avaliacoes[j.id]?.presenca).length,
    [avaliacoes, juvenisAtivos]
  );

  const aniversariantesSemana = useMemo(
    () =>
      juvenisAtivos.filter((j) =>
        aniversarioNaSemana(j.aniversario_dia, j.aniversario_mes)
      ),
    [juvenisAtivos]
  );

  const aniversariantesHoje = useMemo(
    () =>
      juvenisAtivos.filter((j) =>
        ehAniversarioHoje(j.aniversario_dia, j.aniversario_mes)
      ),
    [juvenisAtivos]
  );

  const aniversariantesMes = useMemo(
    () =>
      juvenisAtivos.filter((j) =>
        ehAniversarioNoMes(j.aniversario_dia, j.aniversario_mes)
      ),
    [juvenisAtivos]
  );

  const liderTrimestre = useMemo(() => {
    const tri = trimestreAtual();
    const meses = TRIMESTRES[tri].meses;
    const ano = new Date().getFullYear();

    const somas: Record<number, number> = {};
    juvenisAtivos.forEach((j) => (somas[j.id] = 0));

    todasAvaliacoes.forEach((a) => {
      const [anoStr, mesStr] = a.data_avaliacao.split("-");
      if (Number(anoStr) !== ano) return;
      if (!meses.includes(Number(mesStr))) return;
      if (!(a.juvenil_id in somas)) return;
      CRITERIOS.forEach((c) => {
        if (a[c]) somas[a.juvenil_id] += SISTEMA_PONTOS[c];
      });
    });

    const candidatos = juvenisAtivos.map((j) => ({
      nome: j.nome,
      total: somas[j.id] ?? 0,
    }));

    const lider = candidatos.reduce<{ nome: string; total: number } | null>(
      (melhor, atual) =>
        !melhor || atual.total > melhor.total ? atual : melhor,
      null
    );

    return lider && lider.total > 0 ? lider : null;
  }, [juvenisAtivos, todasAvaliacoes]);

  const historicoJuvenil = useMemo(() => {
    if (!juvenilAberto) return [];
    return todasAvaliacoes
      .filter((a) => a.juvenil_id === juvenilAberto.id)
      .sort((a, b) => a.data_avaliacao.localeCompare(b.data_avaliacao));
  }, [todasAvaliacoes, juvenilAberto]);

  const statsJuvenil = useMemo(() => {
    if (!juvenilAberto || historicoJuvenil.length === 0) return null;
    const total = historicoJuvenil.reduce(
      (s, a) => s + calcularTotalLinha(a),
      0
    );
    const presencas = historicoJuvenil.filter((a) => a.presenca).length;
    const faltas = historicoJuvenil.length - presencas;
    const percentual = Math.round((presencas / historicoJuvenil.length) * 100);
    const media = Math.round(total / historicoJuvenil.length);
    const recorde = Math.max(...historicoJuvenil.map(calcularTotalLinha));
    return { total, presencas, faltas, percentual, media, recorde };
  }, [juvenilAberto, historicoJuvenil]);

  const medalhasJuvenil = useMemo(() => {
    if (!juvenilAberto) return [];
    return calcularMedalhas(historicoJuvenil);
  }, [juvenilAberto, historicoJuvenil]);

  /* ----------------------- Dark mode ----------------------------- */

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

  /* ----------------------- Renderização condicional -------------- */

  if (carregandoAuth) return <SkeletonScreen />;
  if (!userId) return <LoginScreen />;
  if (!profile) return <SkeletonScreen />;
  if (profile.must_change_password)
    return <TrocarSenhaScreen profile={profile} />;
  if (carregando && juvenis.length === 0) return <SkeletonScreen />;

  /* ----------------------- UI principal -------------------------- */

  return (
    <main className="min-h-screen bg-slate-50 p-4 transition-colors dark:bg-slate-950 dark:text-slate-100 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 sm:text-3xl">
              Avaliação de Juvenis
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Pontuação máxima:{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {PONTUACAO_MAXIMA} pontos
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              👤 {profile.nome}
            </span>

            <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800">
              <span className="text-slate-500 dark:text-slate-400">📅</span>
              <input
                type="date"
                value={dataSelecionada}
                onChange={(e) => setDataSelecionada(e.target.value)}
                className="bg-transparent text-slate-700 outline-none dark:text-slate-200"
              />
            </label>

            <button
              onClick={() => setModalNovoAberto(true)}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              ➕ Novo Juvenil
            </button>

            <button
              onClick={() => setModalGerenciarAberto(true)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              ⚙️ Gerenciar
            </button>

            <Link
              href="/ranking"
              prefetch={true}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              🏆 Ver Ranking
            </Link>
            <Link
              href="/premiacoes"
              prefetch={true}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-amber-600"
            >
              🏅 Premiações
            </Link>

            <button
              onClick={alternarTema}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {dark ? "☀️ Claro" : "🌙 Escuro"}
            </button>

            <button
              onClick={fazerLogout}
              className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:bg-slate-800 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              Sair
            </button>
          </div>
        </header>

        <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              👥 Juvenis ativos
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">
              {juvenisAtivos.length}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              ✅ Presentes
            </p>
            <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-300">
              {presentes}/{juvenisAtivos.length}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              🎂 Aniversários do mês
            </p>
            <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-300">
              {aniversariantesMes.length}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              🏆 Líder do trimestre
            </p>
            <p className="mt-1 truncate text-sm font-bold text-slate-800 dark:text-slate-100">
              {liderTrimestre
                ? `${liderTrimestre.nome.split(" ")[0]} (${liderTrimestre.total} pts)`
                : "—"}
            </p>
          </div>
        </section>

        {aniversariantesHoje.length > 0 ? (
          <div className="mb-4 rounded-xl bg-yellow-100 px-4 py-3 text-sm font-semibold text-yellow-900 ring-2 ring-yellow-400 dark:bg-yellow-900/50 dark:text-yellow-200 dark:ring-yellow-500">
            🎉 Hoje é aniversário de{" "}
            {aniversariantesHoje.map((j) => j.nome.split(" ")[0]).join(", ")}!
            Parabéns! 🎂
          </div>
        ) : (
          aniversariantesSemana.length > 0 && (
            <div className="mb-4 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900">
              🎂 Aniversariantes da semana:{" "}
              {aniversariantesSemana
                .map(
                  (j) =>
                    `${String(j.aniversario_dia).padStart(2, "0")}/${String(
                      j.aniversario_mes
                    ).padStart(2, "0")} - ${j.nome.split(" ")[0]}`
                )
                .join(" • ")}
            </div>
          )
        )}

        <div className="mb-4 flex flex-col gap-2 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:ring-blue-900 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Avaliando o sábado de{" "}
            <span className="font-semibold">
              {formatarDataBR(dataSelecionada)}
            </span>
            .
          </span>
          <button
            onClick={alternarTodosPresentes}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition ${
              todosPresentes
                ? "bg-red-600 hover:bg-red-700"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {todosPresentes
              ? "❌ Desmarcar todos presentes"
              : "✅ Marcar todos presentes"}
          </button>
        </div>

        <section className="mb-4 flex flex-wrap gap-2">
          {CRITERIOS.map((c) => (
            <span
              key={c}
              className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"
            >
              {LABEL[c]}: {SISTEMA_PONTOS[c]} pts
            </span>
          ))}
        </section>

        <section className="space-y-3 sm:hidden">
          {juvenisAtivos.map((j) => {
            const row = avaliacoes[j.id];
            const temPresenca = row?.presenca ?? false;
            const total = calcularTotal(j.id);

            return (
              <div
                key={j.id}
                className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <button
                    onClick={() => setJuvenilAberto(j)}
                    className="text-left text-sm font-semibold text-slate-800 underline-offset-4 transition hover:text-emerald-700 hover:underline dark:text-slate-100 dark:hover:text-emerald-300"
                  >
                    {j.nome}
                  </button>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-sm font-bold ${
                      total === PONTUACAO_MAXIMA
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                        : total >= 60
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                          : total > 0
                            ? "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                            : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                    }`}
                  >
                    {total}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {CRITERIOS.map((c) => {
                    const isPresenca = c === "presenca";
                    const marcado = row?.[c] ?? false;
                    const desabilitado = !isPresenca && !temPresenca;

                    return (
                      <label
                        key={c}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs transition ${
                          marcado
                            ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-800"
                            : desabilitado
                              ? "cursor-not-allowed bg-slate-50 text-slate-400 dark:bg-slate-800/40 dark:text-slate-500"
                              : "bg-slate-50 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={marcado}
                          disabled={desabilitado}
                          onChange={() => alternarCriterio(j.id, c)}
                          className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:cursor-not-allowed dark:border-slate-600 dark:bg-slate-700"
                        />
                        <span className="truncate">{LABEL[c]}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>

        <section className="hidden overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800 sm:block">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <th className="px-4 py-3 text-left font-semibold">#</th>
                <th className="px-4 py-3 text-left font-semibold">Juvenil</th>
                {CRITERIOS.map((c) => (
                  <th key={c} className="px-2 py-3 text-center font-semibold">
                    {LABEL[c]}
                  </th>
                ))}
                <th className="px-4 py-3 text-center font-semibold">Total</th>
              </tr>
            </thead>

            <tbody>
              {juvenisAtivos.map((j, index) => {
                const row = avaliacoes[j.id];
                const temPresenca = row?.presenca ?? false;
                const total = calcularTotal(j.id);

                return (
                  <tr
                    key={j.id}
                    className={
                      index % 2 === 0
                        ? "bg-white dark:bg-slate-900"
                        : "bg-slate-50/60 dark:bg-slate-800/40"
                    }
                  >
                    <td className="px-4 py-2 text-slate-500 dark:text-slate-400">
                      {j.id}
                    </td>
                    <td className="px-4 py-2 font-medium text-slate-800 dark:text-slate-100">
                      <button
                        onClick={() => setJuvenilAberto(j)}
                        className="text-left underline-offset-4 transition hover:text-emerald-700 hover:underline dark:hover:text-emerald-300"
                        title="Ver histórico do juvenil"
                      >
                        {j.nome}
                      </button>
                    </td>

                    {CRITERIOS.map((c) => {
                      const isPresenca = c === "presenca";
                      const marcado = row?.[c] ?? false;
                      const desabilitado = !isPresenca && !temPresenca;

                      return (
                        <td key={c} className="px-2 py-2 text-center">
                          <label
                            className={`inline-flex cursor-pointer items-center justify-center ${
                              desabilitado
                                ? "cursor-not-allowed opacity-40"
                                : ""
                            }`}
                            title={
                              desabilitado
                                ? "Marque a presença primeiro"
                                : LABEL[c]
                            }
                          >
                            <input
                              type="checkbox"
                              checked={marcado}
                              disabled={desabilitado}
                              onChange={() => alternarCriterio(j.id, c)}
                              className="h-5 w-5 cursor-pointer rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:cursor-not-allowed dark:border-slate-600 dark:bg-slate-700 dark:checked:bg-emerald-500"
                              aria-label={`${LABEL[c]} — ${j.nome}`}
                            />
                          </label>
                        </td>
                      );
                    })}

                    <td className="px-4 py-2 text-center">
                      <span
                        className={`inline-block min-w-[3rem] rounded-full px-2 py-1 text-sm font-bold ${
                          total === PONTUACAO_MAXIMA
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                            : total >= 60
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                              : total > 0
                                ? "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                                : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                        }`}
                      >
                        {total}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {ranking.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
              🏆 Ranking do sábado ({formatarDataBR(dataSelecionada)})
            </h2>
            <ol className="space-y-2">
              {ranking.map((j, i) => (
                <li
                  key={j.id}
                  className="flex items-center justify-between rounded-xl bg-white px-4 py-2 text-sm shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"
                >
                  <span className="flex items-center gap-3">
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                        i === 0
                          ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300"
                          : i === 1
                            ? "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                            : i === 2
                              ? "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300"
                              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="font-medium text-slate-800 dark:text-slate-100">
                      {j.nome}
                    </span>
                  </span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-300">
                    {j.total} pts
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      {/* MODAL DE HISTÓRICO */}
      {juvenilAberto && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setJuvenilAberto(null)}
        >
          <div
            className="my-8 w-full max-w-3xl rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5 dark:border-slate-700">
              <div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  {juvenilAberto.nome}
                </h2>
                {juvenilAberto.aniversario_dia && juvenilAberto.aniversario_mes && (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    🎂 Aniversário:{" "}
                    {String(juvenilAberto.aniversario_dia).padStart(2, "0")}/
                    {String(juvenilAberto.aniversario_mes).padStart(2, "0")}
                  </p>
                )}
              </div>
              <button
                onClick={() => setJuvenilAberto(null)}
                className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[75vh] overflow-y-auto p-5">
              {historicoJuvenil.length === 0 ? (
                <p className="text-center text-slate-500 dark:text-slate-400">
                  Nenhuma avaliação registrada ainda.
                </p>
              ) : (
                <>
                  {medalhasJuvenil.length > 0 && (
                    <section className="mb-5">
                      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        🏅 Conquistas
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {medalhasJuvenil.map((m) => (
                          <div
                            key={m.nome}
                            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-50 to-yellow-50 px-3 py-2 ring-1 ring-amber-200 dark:from-amber-950/40 dark:to-yellow-950/40 dark:ring-amber-800"
                            title={m.descricao}
                          >
                            <span className="text-xl">{m.emoji}</span>
                            <div>
                              <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                                {m.nome}
                              </p>
                              <p className="text-[10px] text-amber-700 dark:text-amber-400">
                                {m.descricao}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {statsJuvenil && (
                    <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:ring-emerald-900">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                          Total de pontos
                        </p>
                        <p className="text-xl font-bold text-emerald-800 dark:text-emerald-200">
                          {statsJuvenil.total}
                        </p>
                      </div>

                      <div className="rounded-xl bg-blue-50 p-3 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:ring-blue-900">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-blue-700 dark:text-blue-400">
                          Presenças
                        </p>
                        <p className="text-xl font-bold text-blue-800 dark:text-blue-200">
                          {statsJuvenil.presencas}
                        </p>
                      </div>

                      <div className="rounded-xl bg-red-50 p-3 ring-1 ring-red-200 dark:bg-red-950/40 dark:ring-red-900">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-red-700 dark:text-red-400">
                          Faltas
                        </p>
                        <p className="text-xl font-bold text-red-800 dark:text-red-200">
                          {statsJuvenil.faltas}
                        </p>
                      </div>

                      <div className="rounded-xl bg-purple-50 p-3 ring-1 ring-purple-200 dark:bg-purple-950/40 dark:ring-purple-900">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-purple-700 dark:text-purple-400">
                          % Presença
                        </p>
                        <p className="text-xl font-bold text-purple-800 dark:text-purple-200">
                          {statsJuvenil.percentual}%
                        </p>
                      </div>

                      <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-slate-800/60 dark:ring-slate-700">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-600 dark:text-slate-400">
                          Média por sábado
                        </p>
                        <p className="text-xl font-bold text-slate-800 dark:text-slate-200">
                          {statsJuvenil.media}
                        </p>
                      </div>

                      <div className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:ring-amber-900">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                          Recorde
                        </p>
                        <p className="text-xl font-bold text-amber-800 dark:text-amber-200">
                          {statsJuvenil.recorde}
                        </p>
                      </div>
                    </section>
                  )}

                  <section className="mb-5">
                    <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      📈 Evolução por sábado
                    </h3>
                    <div className="flex items-end gap-1 overflow-x-auto rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-slate-800/60 dark:ring-slate-700">
                      {historicoJuvenil.map((a) => {
                        const t = calcularTotalLinha(a);
                        const alt = Math.max((t / PONTUACAO_MAXIMA) * 100, 4);
                        return (
                          <div
                            key={a.data_avaliacao}
                            className="flex flex-col items-center gap-1"
                            style={{ minWidth: "28px" }}
                            title={`${formatarDataBR(a.data_avaliacao)} — ${t} pts`}
                          >
                            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">
                              {t}
                            </span>
                            <div
                              className={`w-5 rounded-t ${
                                t === PONTUACAO_MAXIMA
                                  ? "bg-emerald-500"
                                  : t >= 60
                                    ? "bg-amber-500"
                                    : t > 0
                                      ? "bg-slate-400"
                                      : "bg-red-400"
                              }`}
                              style={{ height: `${alt}px` }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <section>
                    <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      📅 Histórico completo
                    </h3>
                    <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200 dark:ring-slate-700">
                      <table className="w-full min-w-[500px] border-collapse text-sm">
                        <thead>
                          <tr className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            <th className="px-3 py-2 text-left font-semibold">
                              Data
                            </th>
                            <th className="px-3 py-2 text-center font-semibold">
                              Pontos
                            </th>
                            <th className="px-3 py-2 text-center font-semibold">
                              Presente?
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...historicoJuvenil].reverse().map((a) => {
                            const t = calcularTotalLinha(a);
                            return (
                              <tr
                                key={a.data_avaliacao}
                                className="border-t border-slate-200 dark:border-slate-700"
                              >
                                <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                                  {formatarDataBR(a.data_avaliacao)}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <span
                                    className={`inline-block min-w-[2.5rem] rounded-full px-2 py-0.5 text-xs font-bold ${
                                      t === PONTUACAO_MAXIMA
                                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                                        : t >= 60
                                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                                          : t > 0
                                            ? "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                                            : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                                    }`}
                                  >
                                    {t}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {a.presenca ? "✅" : "❌"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: NOVO JUVENIL */}
      {modalNovoAberto && (
        <ModalNovoJuvenil
          onFechar={() => setModalNovoAberto(false)}
          onSalvo={() => {
            setModalNovoAberto(false);
            carregarJuvenis();
          }}
        />
      )}

      {/* MODAL: GERENCIAR */}
      {modalGerenciarAberto && (
        <ModalGerenciarJuvenis
          juvenis={juvenis}
          onFechar={() => setModalGerenciarAberto(false)}
          onAtualizado={() => carregarJuvenis()}
        />
      )}

      {/* MODAL: AVISO DE INATIVIDADE */}
      {mostrarAvisoInatividade && (
        <ModalAvisoInatividade
          segundos={segundosRestantes}
          onContinuar={() => {
            ultimaAtividade.current = Date.now();
            setMostrarAvisoInatividade(false);
            setSegundosRestantes(Math.floor(TEMPO_AVISO_MS / 1000));
          }}
        />
      )}
    </main>
  );
}