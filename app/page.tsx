"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase";
import { resolverEmail, validarSenhaAmigavel } from "@/lib/auth-helpers";
import { SecaoVisitantes } from "@/components/SecaoVisitantes";
import { LinhaJuvenilDesktop } from "@/components/LinhaJuvenilDesktop";
import { CardJuvenilMobile } from "@/components/CardJuvenilMobile";
import type { Juvenil, AvaliacaoRow, Criterio, Profile, Medalha } from "@/types";
import { CRITERIOS, LABEL, SISTEMA_PONTOS, PONTUACAO_MAXIMA } from "@/types";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

const TEMPO_INATIVIDADE_MS = 30 * 60 * 1000; // 30 minutos (evita logout precoce durante a aula)
const TEMPO_AVISO_MS = 2 * 60 * 1000; // 2 minutos de aviso prévio

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

function criarAvaliacaoVazia(
  juvenilId: number,
  dataAvaliacao: string
): AvaliacaoRow {
  return {
    juvenil_id: juvenilId,
    data_avaliacao: dataAvaliacao,
    presenca: false,
    pontualidade: false,
    participacao: false,
    estudo_licao: false,
    verso_aureo: false,
    biblia: false,
  };
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

function calcularMedalhas(avaliacoes: AvaliacaoRow[]): Medalha[] {
  const medalhas: Medalha[] = [];
  if (avaliacoes.length === 0) return medalhas;
  const total = avaliacoes.length;
  const presencas = avaliacoes.filter((a) => a.presenca).length;
  if (presencas >= 1)
    medalhas.push({ emoji: "⭐", nome: "Primeira Presença", descricao: "Compareceu pela primeira vez" });
  if (presencas >= 4 && presencas === total)
    medalhas.push({ emoji: "🔥", nome: "Assíduo", descricao: `${presencas} sábados sem faltar` });
  const perfeitos = avaliacoes.filter((a) => calcularTotalLinha(a) === PONTUACAO_MAXIMA).length;
  if (perfeitos >= 1)
    medalhas.push({ emoji: "🏆", nome: "Sábado Perfeito", descricao: `${perfeitos}x com 100 pontos` });
  const comPresenca = avaliacoes.filter((a) => a.presenca);
  if (comPresenca.length >= 3) {
    const taxaEstudo = comPresenca.filter((a) => a.estudo_licao).length / comPresenca.length;
    if (taxaEstudo >= 0.8)
      medalhas.push({ emoji: "📖", nome: "Mestre da Lição", descricao: "80%+ em Estudo da Lição" });
    const taxaBiblia = comPresenca.filter((a) => a.biblia).length / comPresenca.length;
    if (taxaBiblia >= 0.8)
      medalhas.push({ emoji: "📚", nome: "Conhecedor da Bíblia", descricao: "80%+ trazendo Bíblia" });
    const taxaPontual = comPresenca.filter((a) => a.pontualidade).length / comPresenca.length;
    if (taxaPontual >= 0.9)
      medalhas.push({ emoji: "⏰", nome: "Sem Atrasos", descricao: "90%+ de pontualidade" });
  }
  return medalhas;
}

/* ================================================================== */
/*  MODAL: ESQUECI MINHA SENHA                                        */
/* ================================================================== */

function ModalEsqueciSenha({ onFechar }: { onFechar: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [identificador, setIdentificador] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [emailEnviado, setEmailEnviado] = useState<string | null>(null);

  const handleEnviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    const valor = identificador.trim();
    if (!valor) {
      setErro("Informe seu usuário ou e-mail cadastrado.");
      return;
    }

    setCarregando(true);
    const emailFinal = resolverEmail(valor);
    const redirectUrl =
      typeof window !== "undefined" && window.location.origin.includes("sistema-juvenis.vercel.app")
        ? `${window.location.origin}/redefinir-senha`
        : "https://sistema-juvenis.vercel.app/redefinir-senha";

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(emailFinal, {
        redirectTo: redirectUrl,
      });

      if (error) {
        setErro("Não foi possível enviar o link: " + error.message);
        setCarregando(false);
        return;
      }

      setEmailEnviado(emailFinal);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErro("Erro ao processar solicitação: " + msg);
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm"
      onClick={onFechar}
    >
      <div
        className="w-full max-w-sm rounded-3xl border border-white/10 bg-gradient-to-b from-slate-900 to-slate-950 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="bg-gradient-to-r from-purple-200 to-fuchsia-300 bg-clip-text text-lg font-black text-transparent">
              🔑 Recuperar Senha
            </h2>
            <p className="text-xs text-slate-400">Restabeleça seu acesso em 1 minuto</p>
          </div>
          <button
            onClick={onFechar}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-slate-100"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {emailEnviado ? (
          <div className="space-y-4 py-2 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-950/50 border border-purple-500/30 text-2xl">
              📬
            </div>
            <div>
              <p className="text-sm font-bold text-white">Link enviado com sucesso!</p>
              <p className="mt-1 text-xs text-slate-300">
                Enviamos as instruções de redefinição para:
              </p>
              <p className="mt-1.5 font-mono text-xs font-semibold text-fuchsia-300 break-all bg-white/5 py-1.5 px-2.5 rounded-lg border border-white/5">
                {emailEnviado}
              </p>
            </div>
            <div className="rounded-xl border border-purple-500/20 bg-purple-950/30 p-3 text-left text-[11px] text-slate-300 space-y-1">
              <p>• Abra seu e-mail e clique no link de recuperação.</p>
              <p>• Verifique também sua pasta de <strong>Spam / Lixo Eletrônico</strong>.</p>
              <p>• O link expira em poucos minutos por segurança.</p>
            </div>
            <button
              onClick={onFechar}
              className="w-full rounded-2xl bg-gradient-to-r from-purple-600 to-fuchsia-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-purple-500/30 transition hover:shadow-xl"
            >
              Entendido, voltar ao login
            </button>
          </div>
        ) : (
          <form onSubmit={handleEnviar} className="space-y-3.5">
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-purple-300">
                Seu E-mail Cadastrado
              </label>
              <input
                type="email"
                value={identificador}
                onChange={(e) => setIdentificador(e.target.value)}
                placeholder="ex: seu.email@gmail.com"
                autoComplete="email"
                autoFocus
                required
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-purple-400 focus:bg-white/10 focus:ring-2 focus:ring-purple-500/30"
              />
              <p className="mt-1.5 text-[11px] text-slate-400">
                Enviaremos um link de acesso imediato para o e-mail informado.
              </p>
            </div>

            {erro && (
              <div className="rounded-xl border border-red-500/30 bg-red-950/40 px-3 py-2 text-xs font-medium text-red-300">
                ⚠️ {erro}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onFechar}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-medium text-slate-300 transition hover:bg-white/10"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={carregando}
                className="flex-1 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 px-3 py-2.5 text-xs font-bold text-white shadow-lg shadow-purple-500/30 transition hover:shadow-xl disabled:opacity-60"
              >
                {carregando ? "Enviando..." : "Enviar link →"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  LOGIN                                                             */
/* ================================================================== */

function LoginScreen() {
  const supabase = useMemo(() => createClient(), []);
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [modalEsqueciAberto, setModalEsqueciAberto] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    const emailCompleto = resolverEmail(usuario);
    const { error } = await supabase.auth.signInWithPassword({
      email: emailCompleto,
      password: senha,
    });
    if (error) {
      setErro("E-mail ou senha incorretos.");
      setCarregando(false);
      return;
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-4">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 animate-pulse rounded-full bg-purple-600/20 blur-3xl" />
        <div className="absolute -bottom-32 right-1/4 h-80 w-80 animate-pulse rounded-full bg-fuchsia-600/15 blur-3xl" style={{ animationDelay: "1.5s" }} />
      </div>
      <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "24px 24px" }} />

      <div className="relative z-10 w-full max-w-sm">
        <div className="animate-fade-in-lento relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-slate-900/90 to-slate-950/90 p-5 shadow-2xl backdrop-blur-xl">
          <div className="absolute -top-px left-1/2 h-px w-3/4 -translate-x-1/2 bg-gradient-to-r from-transparent via-purple-400 to-transparent" />
          <div className="mb-4 flex justify-center">
            <Image src="/soul-em-cristo.png" alt="Soul em Cristo" width={140} height={80} className="h-auto w-full max-w-[130px] drop-shadow-lg" priority />
          </div>
          <div className="mb-5 text-center">
            <h1 className="text-xl font-black tracking-tight text-white">Bem-vindo(a) 👋</h1>
            <p className="mt-1 text-xs font-medium text-slate-400">Entre pra fazer a chamada de hoje</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-purple-300">E-mail</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base">✉️</span>
                <input type="text" value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="seu.email@gmail.com" autoComplete="email" required className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-3 text-sm text-slate-100 placeholder-slate-500 outline-none transition-all focus:border-purple-400 focus:bg-white/10 focus:ring-2 focus:ring-purple-500/30" />
              </div>
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-fuchsia-300">Senha</label>
                <button
                  type="button"
                  onClick={() => setModalEsqueciAberto(true)}
                  className="text-[10px] font-semibold text-purple-300 hover:text-purple-200 transition hover:underline"
                >
                  Esqueceu a senha?
                </button>
              </div>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base">🔒</span>
                <input type={mostrarSenha ? "text" : "password"} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Digite sua senha" autoComplete="current-password" required className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-11 text-sm text-slate-100 placeholder-slate-500 outline-none transition-all focus:border-fuchsia-400 focus:bg-white/10 focus:ring-2 focus:ring-fuchsia-500/30" />
                <button type="button" onClick={() => setMostrarSenha(!mostrarSenha)} className="absolute right-3 top-1/2 -translate-y-1/2 text-base opacity-60 transition hover:opacity-100" aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}>
                  {mostrarSenha ? "🙈" : "👁️"}
                </button>
              </div>
            </div>
            {erro && (
              <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-950/40 px-3 py-2.5 text-xs font-medium text-red-300">
                <span>⚠️</span><span>{erro}</span>
              </div>
            )}
            <button type="submit" disabled={carregando} className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-purple-600 to-fuchsia-600 px-4 py-3.5 text-sm font-black text-white shadow-lg shadow-purple-500/30 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-fuchsia-500/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100">
              <span className="absolute inset-0 bg-gradient-to-r from-fuchsia-600 to-purple-600 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <span className="relative flex items-center justify-center gap-2">
                {carregando ? (<><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Entrando...</>) : (<>Entrar →</>)}
              </span>
            </button>
          </form>
          <p className="mt-4 text-center text-[10px] font-medium text-slate-500">Soul em Cristo • Avaliação de Juvenis</p>
        </div>
      </div>
      {modalEsqueciAberto && (
        <ModalEsqueciSenha onFechar={() => setModalEsqueciAberto(false)} />
      )}
    </main>
  );
}

/* ================================================================== */
/*  TROCA DE SENHA                                                    */
/* ================================================================== */

function TrocarSenhaScreen({
  profile,
  onSenhaAlterada,
}: {
  profile: Profile;
  onSenhaAlterada?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  const primeiroNome = profile.nome.split(" ")[0];
  const erros = validarSenhaAmigavel(novaSenha, primeiroNome);
  const senhaValida = novaSenha.length > 0 && erros.length === 0;
  const senhasIguais = novaSenha === confirmar && confirmar.length > 0;
  const ehFraseLonga = novaSenha.length >= 12;

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    if (!senhaValida) { setErro("A senha ainda não cumpre todos os requisitos."); return; }
    if (!senhasIguais) { setErro("As senhas não coincidem."); return; }
    setCarregando(true);
    const { error: errorAuth } = await supabase.auth.updateUser({ password: novaSenha });
    if (errorAuth) { setErro("Erro ao salvar: " + errorAuth.message); setCarregando(false); return; }
    const { error: errorProfile } = await supabase.from("profiles").update({ must_change_password: false }).eq("id", profile.id);
    if (errorProfile) { setErro("Erro ao atualizar perfil: " + errorProfile.message); setCarregando(false); return; }
    if (onSenhaAlterada) {
      onSenhaAlterada();
    } else {
      window.location.reload();
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-4">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 animate-pulse rounded-full bg-purple-600/20 blur-3xl" />
        <div className="absolute -bottom-32 left-1/4 h-80 w-80 animate-pulse rounded-full bg-fuchsia-600/15 blur-3xl" style={{ animationDelay: "1.5s" }} />
      </div>
      <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "24px 24px" }} />

      <div className="relative z-10 w-full max-w-sm">
        <div className="animate-fade-in-lento relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-slate-900/90 to-slate-950/90 p-5 shadow-2xl backdrop-blur-xl">
          <div className="absolute -top-px left-1/2 h-px w-3/4 -translate-x-1/2 bg-gradient-to-r from-transparent via-fuchsia-400 to-transparent" />
          <div className="mb-3 flex justify-center">
            <Image src="/soul-em-cristo.png" alt="Soul em Cristo" width={120} height={70} className="h-auto w-full max-w-[110px] drop-shadow-lg" />
          </div>
          <div className="mb-4 rounded-xl border border-purple-500/30 bg-purple-950/40 px-3 py-2.5 text-xs text-purple-200">
            ✨ <strong>Primeiro acesso!</strong> Crie sua senha pessoal.
          </div>
          <div className="mb-4 text-center">
            <h1 className="text-lg font-black tracking-tight text-white">Ei, {primeiroNome}! 🎯</h1>
            <p className="mt-1 text-xs font-medium text-slate-400">Crie uma senha única, só sua</p>
          </div>
          <form onSubmit={handleSalvar} className="space-y-3">
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-purple-300">Nova senha</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base">🔐</span>
                <input type={mostrarSenha ? "text" : "password"} value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} placeholder="Digite sua nova senha" autoComplete="new-password" className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-11 text-sm text-slate-100 placeholder-slate-500 outline-none transition-all focus:border-purple-400 focus:bg-white/10 focus:ring-2 focus:ring-purple-500/30" />
                <button type="button" onClick={() => setMostrarSenha(!mostrarSenha)} className="absolute right-3 top-1/2 -translate-y-1/2 text-base opacity-60 transition hover:opacity-100" aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}>
                  {mostrarSenha ? "🙈" : "👁️"}
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-fuchsia-300">Confirmar senha</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base">✅</span>
                <input type={mostrarSenha ? "text" : "password"} value={confirmar} onChange={(e) => setConfirmar(e.target.value)} placeholder="Repita a senha" autoComplete="new-password" className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-3 text-sm text-slate-100 placeholder-slate-500 outline-none transition-all focus:border-fuchsia-400 focus:bg-white/10 focus:ring-2 focus:ring-fuchsia-500/30" />
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-300">💡 Dica de Senha Amigável</p>
              <ul className="space-y-1 text-[11px]">
                <li className={`flex items-center gap-1.5 font-medium ${novaSenha.length >= 8 ? "text-emerald-400" : "text-slate-500"}`}>
                  <span>{novaSenha.length >= 8 ? "✓" : "○"}</span>
                  <span>Mínimo de 8 caracteres</span>
                </li>
                <li className={`flex items-center gap-1.5 font-medium ${ehFraseLonga || (/[A-Za-z]/.test(novaSenha) && /[0-9]/.test(novaSenha)) ? "text-emerald-400" : "text-slate-500"}`}>
                  <span>{ehFraseLonga || (/[A-Za-z]/.test(novaSenha) && /[0-9]/.test(novaSenha)) ? "✓" : "○"}</span>
                  <span>{ehFraseLonga ? "✨ Frase-senha longa (12+ caracteres) aprovada!" : "Pelo menos 1 letra e 1 número (ou frase de 12+ caracteres)"}</span>
                </li>
                {primeiroNome && (
                  <li className={`flex items-center gap-1.5 font-medium ${novaSenha.length > 0 && !novaSenha.toLowerCase().includes(primeiroNome.toLowerCase()) ? "text-emerald-400" : "text-slate-500"}`}>
                    <span>{novaSenha.length > 0 && !novaSenha.toLowerCase().includes(primeiroNome.toLowerCase()) ? "✓" : "○"}</span>
                    <span>Não pode conter seu nome ("{primeiroNome}")</span>
                  </li>
                )}
                {confirmar.length > 0 && (
                  <li className={`flex items-center gap-1.5 font-medium ${senhasIguais ? "text-emerald-400" : "text-red-400"}`}>
                    <span>{senhasIguais ? "✓" : "✕"}</span>
                    <span>{senhasIguais ? "Senhas coincidem" : "Senhas diferentes"}</span>
                  </li>
                )}
              </ul>
            </div>
            {erro && (
              <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-950/40 px-3 py-2.5 text-xs font-medium text-red-300">
                <span>⚠️</span><span>{erro}</span>
              </div>
            )}
            <button type="submit" disabled={carregando || !senhaValida || !senhasIguais} className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-purple-600 to-fuchsia-600 px-4 py-3.5 text-sm font-black text-white shadow-lg shadow-purple-500/30 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-fuchsia-500/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100">
              <span className="absolute inset-0 bg-gradient-to-r from-fuchsia-600 to-purple-600 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <span className="relative flex items-center justify-center gap-2">
                {carregando ? (<><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Salvando...</>) : (<>Salvar senha →</>)}
              </span>
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

/* ================================================================== */
/*  SKELETON                                                          */
/* ================================================================== */

function SkeletonScreen() {
  return (
    <main className="min-h-screen bg-slate-950 p-4 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="h-20 animate-pulse rounded-2xl bg-white/5" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (<div key={i} className="h-28 animate-pulse rounded-2xl bg-white/5" />))}
        </div>
        <div className="h-16 animate-pulse rounded-2xl bg-white/5" />
        <div className="space-y-3 sm:hidden">{[1, 2, 3].map((i) => (<div key={i} className="h-32 animate-pulse rounded-2xl bg-white/5" />))}</div>
        <div className="hidden sm:block">{[1, 2, 3, 4, 5].map((i) => (<div key={i} className="mb-2 h-14 animate-pulse rounded-2xl bg-white/5" />))}</div>
      </div>
    </main>
  );
}

/* ================================================================== */
/*  MODAL: NOVO JUVENIL                                               */
/* ================================================================== */

function ModalNovoJuvenil({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: () => void; }) {
  const supabase = useMemo(() => createClient(), []);
  const [nome, setNome] = useState("");
  const [dia, setDia] = useState("");
  const [mes, setMes] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    if (nome.trim().length < 3) { setErro("Digite o nome completo do juvenil."); return; }
    if (!dia || !mes) { setErro("Informe o dia e o mês de aniversário."); return; }
    const diaNum = Number(dia);
    const mesNum = Number(mes);
    if (!Number.isInteger(diaNum) || diaNum < 1 || diaNum > 31) { setErro("Dia do aniversário deve ser entre 1 e 31."); return; }
    if (!Number.isInteger(mesNum) || mesNum < 1 || mesNum > 12) { setErro("Mês do aniversário deve ser entre 1 e 12."); return; }
    setSalvando(true);
    const { error } = await supabase.from("juvenis").insert({ nome: nome.trim(), aniversario_dia: diaNum, aniversario_mes: mesNum, ativo: true });
    if (error) { console.error("Erro ao cadastrar juvenil:", error); setErro("Erro ao salvar: " + error.message); setSalvando(false); return; }
    onSalvo();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onClick={onFechar}>
      <div className="my-8 w-full max-w-md rounded-3xl border border-white/10 bg-gradient-to-b from-slate-900 to-slate-950 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="bg-gradient-to-r from-purple-200 to-fuchsia-300 bg-clip-text text-xl font-black text-transparent">✨ Novo Juvenil</h2>
            <p className="text-xs text-slate-400">Cadastre um novo membro da classe</p>
          </div>
          <button onClick={onFechar} className="rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-slate-100" aria-label="Fechar">✕</button>
        </div>
        <form onSubmit={handleSalvar} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-purple-300">Nome completo <span className="text-red-400">*</span></label>
            <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Maria Clara Santos" autoFocus required className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-purple-400 focus:bg-white/10 focus:ring-2 focus:ring-purple-500/30" />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-fuchsia-300">Aniversário <span className="text-red-400">*</span></label>
            <div className="flex items-center gap-2">
              <input type="number" min="1" max="31" value={dia} onChange={(e) => setDia(e.target.value)} placeholder="DD" required className="w-20 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-center text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-500/30" />
              <span className="text-slate-500">/</span>
              <input type="number" min="1" max="12" value={mes} onChange={(e) => setMes(e.target.value)} placeholder="MM" required className="w-20 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-center text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-500/30" />
              <span className="text-xs text-slate-500">dia / mês</span>
            </div>
          </div>
          {erro && (<div className="rounded-xl border border-red-500/30 bg-red-950/40 px-3 py-2.5 text-xs font-medium text-red-300">⚠️ {erro}</div>)}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onFechar} className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/10">Cancelar</button>
            <button type="submit" disabled={salvando} className="flex-1 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-purple-500/30 transition hover:shadow-xl disabled:opacity-60">
              {salvando ? "Salvando..." : "Cadastrar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  MODAL: GERENCIAR                                                  */
/* ================================================================== */

function ModalGerenciarJuvenis({ juvenis, onFechar, onAtualizado }: { juvenis: Juvenil[]; onFechar: () => void; onAtualizado: () => void; }) {
  const supabase = useMemo(() => createClient(), []);
  const [processando, setProcessando] = useState<number | null>(null);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [nomeEdicao, setNomeEdicao] = useState("");
  const [diaEdicao, setDiaEdicao] = useState("");
  const [mesEdicao, setMesEdicao] = useState("");
  const [erroEdicao, setErroEdicao] = useState("");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  const iniciarEdicao = (j: Juvenil) => {
    setEditandoId(j.id);
    setNomeEdicao(j.nome);
    setDiaEdicao(j.aniversario_dia ? String(j.aniversario_dia) : "");
    setMesEdicao(j.aniversario_mes ? String(j.aniversario_mes) : "");
    setErroEdicao("");
  };

  const cancelarEdicao = () => {
    setEditandoId(null);
    setNomeEdicao("");
    setDiaEdicao("");
    setMesEdicao("");
    setErroEdicao("");
  };

  const salvarEdicao = async (juvenilId: number) => {
    setErroEdicao("");
    if (nomeEdicao.trim().length < 3) { setErroEdicao("Digite o nome completo (mínimo 3 caracteres)."); return; }
    if (!diaEdicao || !mesEdicao) { setErroEdicao("Informe o dia e o mês de aniversário."); return; }
    const diaNum = Number(diaEdicao);
    const mesNum = Number(mesEdicao);
    if (!Number.isInteger(diaNum) || diaNum < 1 || diaNum > 31) { setErroEdicao("O dia deve ser entre 1 e 31."); return; }
    if (!Number.isInteger(mesNum) || mesNum < 1 || mesNum > 12) { setErroEdicao("O mês deve ser entre 1 e 12."); return; }
    setSalvandoEdicao(true);
    const { error } = await supabase.from("juvenis").update({ nome: nomeEdicao.trim(), aniversario_dia: diaNum, aniversario_mes: mesNum }).eq("id", juvenilId);
    setSalvandoEdicao(false);
    if (error) { setErroEdicao("Erro ao atualizar: " + error.message); return; }
    cancelarEdicao();
    onAtualizado();
  };

  const alternarAtivo = async (j: Juvenil) => {
    const novoStatus = !j.ativo;
    const msg = novoStatus ? `Reativar ${j.nome}?` : `Inativar ${j.nome}? Ele(a) sairá da listagem, mas todo o histórico será preservado.`;
    if (!confirm(msg)) return;
    setProcessando(j.id);
    const { error } = await supabase.from("juvenis").update({ ativo: novoStatus }).eq("id", j.id);
    setProcessando(null);
    if (error) { alert("Erro ao atualizar: " + error.message); return; }
    onAtualizado();
  };

  const ativos = juvenis.filter((j) => j.ativo !== false);
  const inativos = juvenis.filter((j) => j.ativo === false);

  const renderItemJuvenil = (j: Juvenil, inativo: boolean) => {
    const estaEditando = editandoId === j.id;

    if (estaEditando) {
      return (
        <li key={j.id} className="rounded-2xl border border-purple-500/40 bg-purple-950/20 p-3">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-purple-300">Nome completo *</label>
              <input type="text" value={nomeEdicao} onChange={(e) => setNomeEdicao(e.target.value)} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-500/30" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-fuchsia-300">Aniversário (DD / MM) *</label>
              <div className="flex items-center gap-2">
                <input type="number" min="1" max="31" value={diaEdicao} onChange={(e) => setDiaEdicao(e.target.value)} placeholder="DD" className="w-16 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-center text-sm text-slate-100 outline-none focus:border-fuchsia-400" />
                <span className="text-slate-500">/</span>
                <input type="number" min="1" max="12" value={mesEdicao} onChange={(e) => setMesEdicao(e.target.value)} placeholder="MM" className="w-16 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-center text-sm text-slate-100 outline-none focus:border-fuchsia-400" />
              </div>
            </div>
            {erroEdicao && (<p className="text-xs font-medium text-red-400">⚠️ {erroEdicao}</p>)}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={cancelarEdicao} disabled={salvandoEdicao} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/10">Cancelar</button>
              <button type="button" onClick={() => salvarEdicao(j.id)} disabled={salvandoEdicao} className="rounded-lg bg-gradient-to-r from-purple-600 to-fuchsia-600 px-3 py-1.5 text-xs font-bold text-white shadow-lg shadow-purple-500/30 transition disabled:opacity-50">{salvandoEdicao ? "Salvando..." : "Salvar"}</button>
            </div>
          </div>
        </li>
      );
    }

    return (
      <li key={j.id} className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 transition ${inativo ? "border-white/5 bg-white/[0.02] opacity-70" : "border-white/10 bg-white/5 hover:border-purple-500/30"}`}>
        <div className="min-w-0">
          <p className={`truncate text-sm font-semibold ${inativo ? "text-slate-500" : "text-slate-100"}`}>{j.nome}</p>
          <p className="text-[11px] text-slate-500">
            🎂 {j.aniversario_dia && j.aniversario_mes ? `${String(j.aniversario_dia).padStart(2, "0")}/${String(j.aniversario_mes).padStart(2, "0")}` : "Sem aniversário cadastrado"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button onClick={() => iniciarEdicao(j)} className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-xs font-semibold text-purple-300 transition hover:bg-purple-500/20">✏️ Editar</button>
          {inativo ? (
            <button onClick={() => alternarAtivo(j)} disabled={processando === j.id} className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50">{processando === j.id ? "..." : "Reativar"}</button>
          ) : (
            <button onClick={() => alternarAtivo(j)} disabled={processando === j.id} className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50">{processando === j.id ? "..." : "Inativar"}</button>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onClick={onFechar}>
      <div className="my-8 w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-slate-900 to-slate-950 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-white/10 p-5">
          <div>
            <h2 className="bg-gradient-to-r from-purple-200 to-fuchsia-300 bg-clip-text text-xl font-black text-transparent">⚙️ Gerenciar Juvenis</h2>
            <p className="text-xs text-slate-400">Edite, inative ou reative membros da classe</p>
          </div>
          <button onClick={onFechar} className="rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-slate-100" aria-label="Fechar">✕</button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">
          <section className="mb-6">
            <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-emerald-400">✅ Ativos ({ativos.length})</h3>
            <ul className="space-y-2">{ativos.map((j) => renderItemJuvenil(j, false))}</ul>
          </section>
          {inativos.length > 0 && (
            <section>
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">💤 Inativos ({inativos.length})</h3>
              <ul className="space-y-2">{inativos.map((j) => renderItemJuvenil(j, true))}</ul>
            </section>
          )}
          {inativos.length === 0 && (<p className="mt-4 text-center text-xs text-slate-500">Nenhum juvenil inativo no momento.</p>)}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  MODAL: AVISO INATIVIDADE                                          */
/* ================================================================== */

function ModalAvisoInatividade({ segundos, onContinuar }: { segundos: number; onContinuar: () => void; }) {
  const minutos = Math.floor(segundos / 60);
  const seg = segundos % 60;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-gradient-to-b from-slate-900 to-slate-950 p-6 text-center shadow-2xl">
        <div className="mb-3 text-5xl">⏰</div>
        <h2 className="mb-2 text-xl font-black text-slate-100">Você ainda está aí?</h2>
        <p className="mb-4 text-sm text-slate-400">Por segurança, vamos encerrar sua sessão em:</p>
        <div className="mb-5 text-3xl font-black text-amber-400">{String(minutos).padStart(2, "0")}:{String(seg).padStart(2, "0")}</div>
        <button onClick={onContinuar} className="w-full rounded-2xl bg-gradient-to-r from-purple-600 to-fuchsia-600 px-4 py-3 font-bold text-white shadow-lg shadow-purple-500/30 transition hover:shadow-xl">✅ Continuar conectado</button>
        <p className="mt-3 text-[10px] text-slate-500">Se não houver interação, você será desconectado.</p>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  HOME                                                              */
/* ================================================================== */

export default function Home() {
  const supabase = useMemo(() => createClient(), []);

  const [carregandoAuth, setCarregandoAuth] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [juvenis, setJuvenis] = useState<Juvenil[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<Record<number, AvaliacaoRow>>({});
  const [carregando, setCarregando] = useState(true);
  const [dataSelecionada, setDataSelecionada] = useState<string>(hojeISO());
  const [juvenilAberto, setJuvenilAberto] = useState<Juvenil | null>(null);
  const [historicoJuvenil, setHistoricoJuvenil] = useState<AvaliacaoRow[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [liderTrimestre, setLiderTrimestre] = useState<{ nome: string; total: number } | null>(null);
  const [modalNovoAberto, setModalNovoAberto] = useState(false);
  const [modalGerenciarAberto, setModalGerenciarAberto] = useState(false);
  const [statusSalvamento, setStatusSalvamento] = useState<"salvo" | "salvando" | "erro">("salvo");
  const pendenciasCountRef = useRef(0);

  const [erroToast, setErroToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const exibirErro = useCallback((mensagem: string) => {
    setErroToast(mensagem);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setErroToast(null), 6000);
  }, []);

  const abrirDetalhesJuvenil = useCallback(async (j: Juvenil) => {
    setJuvenilAberto(j);
    setCarregandoHistorico(true);
    const inicioAno = `${new Date().getFullYear()}-01-01`;
    const { data } = await supabase
      .from("avaliacoes")
      .select("*")
      .eq("juvenil_id", j.id)
      .gte("data_avaliacao", inicioAno)
      .order("data_avaliacao", { ascending: true });

    setHistoricoJuvenil(data ?? []);
    setCarregandoHistorico(false);
  }, [supabase]);

  useEffect(() => {
    return () => { if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current); };
  }, []);

  const [mostrarAvisoInatividade, setMostrarAvisoInatividade] = useState(false);
  const mostrarAvisoInatividadeRef = useRef(false);
  const [segundosRestantes, setSegundosRestantes] = useState(Math.floor(TEMPO_AVISO_MS / 1000));
  const ultimaAtividade = useRef(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const avaliacoesRef = useRef<Record<number, AvaliacaoRow>>({});
  const avaliacoesConfirmadasRef = useRef<Record<number, AvaliacaoRow>>({});
  const timeouts = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const camposPendentes = useRef<Record<number, Set<Criterio>>>({});

  useEffect(() => { avaliacoesRef.current = avaliacoes; }, [avaliacoes]);
  useEffect(() => { mostrarAvisoInatividadeRef.current = mostrarAvisoInatividade; }, [mostrarAvisoInatividade]);

  // Se o Supabase redirecionar para a raiz com código de recuperação (?code=...), encaminha para a tela de redefinição
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("code")) {
        window.location.href = `/redefinir-senha?${params.toString()}`;
      }
    }
  }, []);

  useEffect(() => {
    let ativo = true;
    async function verificar() {
      const { data } = await supabase.auth.getSession();
      if (!ativo) return;
      if (data.session?.user) setUserId(data.session.user.id);
      else setCarregandoAuth(false);
    }
    verificar();
    const { data: sub } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (session?.user) setUserId(session.user.id);
      else { setUserId(null); setProfile(null); setCarregandoAuth(false); }
    });
    return () => { ativo = false; sub.subscription.unsubscribe(); };
  }, [supabase]);

  useEffect(() => {
    if (!userId) return;
    async function carregarProfile() {
      const { data, error } = await supabase.from("profiles").select("id, nome, email, username, must_change_password").eq("id", userId).single();
      if (error || !data) { console.error("Erro ao carregar perfil:", error); setCarregandoAuth(false); return; }
      await supabase.from("profiles").update({ ultimo_login: new Date().toISOString() }).eq("id", userId);
      setProfile(data as Profile);
      setCarregandoAuth(false);
    }
    carregarProfile();
  }, [userId, supabase]);

  const fazerLogout = async () => {
    if (!confirm("Deseja realmente sair?")) return;
    await supabase.auth.signOut();
    setProfile(null);
    setUserId(null);
  };

  useEffect(() => {
    if (!profile || profile.must_change_password) return;
    ultimaAtividade.current = Date.now(); // Reinicia o contador no momento do login!
    const registrarAtividade = () => {
      ultimaAtividade.current = Date.now();
      if (mostrarAvisoInatividadeRef.current) {
        mostrarAvisoInatividadeRef.current = false;
        setMostrarAvisoInatividade(false);
        setSegundosRestantes(Math.floor(TEMPO_AVISO_MS / 1000));
      }
    };
    const eventos = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click"];
    eventos.forEach((evento) => window.addEventListener(evento, registrarAtividade, { passive: true }));
    intervalRef.current = setInterval(() => {
      const inativo = Date.now() - ultimaAtividade.current;
      if (inativo >= TEMPO_INATIVIDADE_MS) {
        supabase.auth.signOut().then(() => { setProfile(null); setUserId(null); });
      } else if (inativo >= TEMPO_INATIVIDADE_MS - TEMPO_AVISO_MS) {
        const restante = Math.max(0, Math.ceil((TEMPO_INATIVIDADE_MS - inativo) / 1000));
        setMostrarAvisoInatividade(true);
        setSegundosRestantes(restante);
      } else if (mostrarAvisoInatividadeRef.current) {
        setMostrarAvisoInatividade(false);
      }
    }, 1000);
    return () => {
      eventos.forEach((evento) => window.removeEventListener(evento, registrarAtividade));
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [profile, supabase]);

  const carregarJuvenis = useCallback(async () => {
    const { data, error } = await supabase.from("juvenis").select("id, nome, aniversario_dia, aniversario_mes, ativo").order("id");
    if (error) { console.error("Erro ao carregar juvenis:", error); exibirErro("Erro ao carregar a lista de juvenis."); return; }
    setJuvenis(data ?? []);
  }, [supabase, exibirErro]);

  useEffect(() => {
    if (!profile || profile.must_change_password) return;
    carregarJuvenis();
  }, [profile, carregarJuvenis]);

  useEffect(() => {
    if (!profile || profile.must_change_password || juvenis.length === 0) return;
    async function carregarLider() {
      const tri = trimestreAtual();
      const meses = TRIMESTRES[tri].meses;
      const ano = new Date().getFullYear();
      const mesInicio = String(meses[0]).padStart(2, "0");
      const mesFim = String(meses[meses.length - 1]).padStart(2, "0");
      const dataInicio = `${ano}-${mesInicio}-01`;
      const dataFim = `${ano}-${mesFim}-31`;

      const { data, error } = await supabase
        .from("avaliacoes")
        .select("juvenil_id, presenca, pontualidade, participacao, estudo_licao, verso_aureo, biblia")
        .gte("data_avaliacao", dataInicio)
        .lte("data_avaliacao", dataFim);

      if (error || !data || data.length === 0) return;

      const somas: Record<number, number> = {};
      (data as any[]).forEach((a) => {
        const tot = calcularTotalLinha(a as AvaliacaoRow);
        somas[a.juvenil_id] = (somas[a.juvenil_id] ?? 0) + tot;
      });

      let melhorId: number | null = null;
      let melhorTotal = 0;
      Object.entries(somas).forEach(([idStr, total]) => {
        if (total > melhorTotal) {
          melhorTotal = total;
          melhorId = Number(idStr);
        }
      });

      if (melhorId) {
        const j = juvenis.find((x) => x.id === melhorId);
        if (j) setLiderTrimestre({ nome: j.nome, total: melhorTotal });
      }
    }
    carregarLider();
  }, [profile, juvenis, supabase]);

  useEffect(() => {
    if (!profile || profile.must_change_password) return;
    async function carregarAvaliacoes() {
      setCarregando(true);
      const { data, error } = await supabase.from("avaliacoes").select("*").eq("data_avaliacao", dataSelecionada);
      if (error) { console.error("Erro ao buscar avaliações:", error.message, error); exibirErro("Erro ao carregar avaliações da data selecionada."); setCarregando(false); return; }
      const mapa: Record<number, AvaliacaoRow> = {};
      (data ?? []).forEach((row: AvaliacaoRow) => { mapa[row.juvenil_id] = row; });
      avaliacoesRef.current = { ...mapa };
      avaliacoesConfirmadasRef.current = { ...mapa };
      setAvaliacoes(mapa);
      setCarregando(false);
    }
    carregarAvaliacoes();
  }, [dataSelecionada, profile, supabase, exibirErro]);

  const juvenisAtivos = useMemo(() => juvenis.filter((j) => j.ativo !== false), [juvenis]);

  const alternarCriterio = (juvenilId: number, criterio: Criterio) => {
    const rowAtual = avaliacoesRef.current[juvenilId];
    const base: AvaliacaoRow = rowAtual ?? criarAvaliacaoVazia(juvenilId, dataSelecionada);
    const isPresenca = criterio === "presenca";
    const temPresenca = base.presenca;
    const statusAtual = base[criterio];

    let novaRow: AvaliacaoRow;
    const camposMudados: Criterio[] = [];

    if (isPresenca && statusAtual) {
      // Desmarcando presença: desmarca todos os critérios
      novaRow = { ...base, presenca: false, pontualidade: false, participacao: false, estudo_licao: false, verso_aureo: false, biblia: false };
      camposMudados.push("presenca", "pontualidade", "participacao", "estudo_licao", "verso_aureo", "biblia");
    } else if (!isPresenca && !temPresenca) {
      // Regra automática: Quem trouxe Bíblia, Lição ou pontuou, estava PRESENTE!
      novaRow = { ...base, presenca: true, [criterio]: true };
      camposMudados.push("presenca", criterio);
    } else {
      novaRow = { ...base, [criterio]: !statusAtual };
      camposMudados.push(criterio);
    }

    setAvaliacoes((prev) => { const novo = { ...prev, [juvenilId]: novaRow }; avaliacoesRef.current = novo; return novo; });

    if (!camposPendentes.current[juvenilId]) camposPendentes.current[juvenilId] = new Set();
    camposMudados.forEach((c) => camposPendentes.current[juvenilId].add(c));
    if (timeouts.current[juvenilId]) clearTimeout(timeouts.current[juvenilId]);

    pendenciasCountRef.current += 1;
    setStatusSalvamento("salvando");

    const dataAlvo = dataSelecionada;
    timeouts.current[juvenilId] = setTimeout(async () => {
      const camposParaSalvar = camposPendentes.current[juvenilId];
      const rowFinal = avaliacoesRef.current[juvenilId];
      delete camposPendentes.current[juvenilId];
      delete timeouts.current[juvenilId];
      if (!camposParaSalvar || !rowFinal) {
        pendenciasCountRef.current = Math.max(0, pendenciasCountRef.current - 1);
        if (pendenciasCountRef.current === 0) setStatusSalvamento("salvo");
        return;
      }
      const updateParcial: Record<string, boolean> = {};
      camposParaSalvar.forEach((c) => { updateParcial[c] = rowFinal[c]; });
      const { error: erroUpsert } = await supabase.from("avaliacoes").upsert({ juvenil_id: juvenilId, data_avaliacao: dataAlvo }, { onConflict: "data_avaliacao,juvenil_id", ignoreDuplicates: true });
      const { error: erroUpdate } = erroUpsert ? { error: erroUpsert } : await supabase.from("avaliacoes").update(updateParcial).eq("juvenil_id", juvenilId).eq("data_avaliacao", dataAlvo);
      
      pendenciasCountRef.current = Math.max(0, pendenciasCountRef.current - 1);

      if (erroUpsert || erroUpdate) {
        const erroReal = erroUpsert || erroUpdate;
        console.error("Erro ao salvar avaliação:", erroReal?.message, erroReal);
        setStatusSalvamento("erro");
        const estadoAnterior = avaliacoesConfirmadasRef.current[juvenilId] ?? criarAvaliacaoVazia(juvenilId, dataAlvo);
        setAvaliacoes((prev) => { const novo = { ...prev, [juvenilId]: estadoAnterior }; avaliacoesRef.current = novo; return novo; });
        const nomeJuvenil = juvenis.find((j) => j.id === juvenilId)?.nome ?? "juvenil";
        exibirErro(`Falha ao salvar alteração de ${nomeJuvenil}. Os dados foram revertidos.`);
        return;
      }
      avaliacoesConfirmadasRef.current[juvenilId] = { ...rowFinal };
      if (pendenciasCountRef.current === 0) {
        setStatusSalvamento("salvo");
      }
    }, 600);
  };

  const todosPresentes = useMemo(() => {
    if (juvenisAtivos.length === 0) return false;
    return juvenisAtivos.every((j) => avaliacoes[j.id]?.presenca === true);
  }, [juvenisAtivos, avaliacoes]);

  const alternarTodosPresentes = async () => {
    const acao = todosPresentes ? "DESMARCAR a presença de TODOS" : "marcar presença de TODOS";
    if (!confirm(`Deseja ${acao} os juvenis ativos neste sábado?`)) return;
    const ids = juvenisAtivos.map((j) => j.id);
    if (ids.length === 0) return;
    const snapshotAvaliacoes = { ...avaliacoesRef.current };
    const novoMapa: Record<number, AvaliacaoRow> = { ...avaliacoesRef.current };
    juvenisAtivos.forEach((j) => {
      const anterior = avaliacoesRef.current[j.id] ?? criarAvaliacaoVazia(j.id, dataSelecionada);
      if (todosPresentes) {
        novoMapa[j.id] = { ...anterior, juvenil_id: j.id, data_avaliacao: dataSelecionada, presenca: false, pontualidade: false, participacao: false, estudo_licao: false, verso_aureo: false, biblia: false };
      } else {
        novoMapa[j.id] = { ...anterior, juvenil_id: j.id, data_avaliacao: dataSelecionada, presenca: true };
      }
    });
    avaliacoesRef.current = novoMapa;
    setAvaliacoes(novoMapa);
    setStatusSalvamento("salvando");
    const { error: erroUpsert } = await supabase.from("avaliacoes").upsert(juvenisAtivos.map((j) => ({ juvenil_id: j.id, data_avaliacao: dataSelecionada })), { onConflict: "data_avaliacao,juvenil_id", ignoreDuplicates: true });
    if (erroUpsert) {
      console.error("Erro no upsert em massa:", erroUpsert.message, erroUpsert);
      setStatusSalvamento("erro");
      avaliacoesRef.current = snapshotAvaliacoes;
      setAvaliacoes(snapshotAvaliacoes);
      exibirErro("Não foi possível atualizar a presença de todos. Verifique sua conexão.");
      return;
    }
    const payloadUpdate = todosPresentes ? { presenca: false, pontualidade: false, participacao: false, estudo_licao: false, verso_aureo: false, biblia: false } : { presenca: true };
    const { error: erroUpdate } = await supabase.from("avaliacoes").update(payloadUpdate).eq("data_avaliacao", dataSelecionada).in("juvenil_id", ids);
    if (erroUpdate) {
      console.error("Erro ao atualizar todos:", erroUpdate.message, erroUpdate);
      setStatusSalvamento("erro");
      avaliacoesRef.current = snapshotAvaliacoes;
      setAvaliacoes(snapshotAvaliacoes);
      exibirErro("Erro ao salvar presença em massa no banco. Alteração revertida.");
      return;
    }
    setStatusSalvamento("salvo");
    const { data } = await supabase.from("avaliacoes").select("*").eq("data_avaliacao", dataSelecionada);
    const mapa: Record<number, AvaliacaoRow> = {};
    (data ?? []).forEach((row: AvaliacaoRow) => { mapa[row.juvenil_id] = row; });
    avaliacoesRef.current = mapa;
    avaliacoesConfirmadasRef.current = { ...mapa };
    setAvaliacoes(mapa);
  };

  const calcularTotal = useCallback((juvenilId: number): number => {
    const row = avaliacoes[juvenilId];
    if (!row) return 0;
    return calcularTotalLinha(row);
  }, [avaliacoes]);

  const ranking = useMemo(() => {
    return juvenisAtivos.map((j) => ({ ...j, total: calcularTotal(j.id) })).filter((j) => j.total > 0).sort((a, b) => b.total - a.total);
  }, [juvenisAtivos, calcularTotal]);

  const presentes = useMemo(() => juvenisAtivos.filter((j) => avaliacoes[j.id]?.presenca).length, [avaliacoes, juvenisAtivos]);
  const aniversariantesSemana = useMemo(() => juvenisAtivos.filter((j) => aniversarioNaSemana(j.aniversario_dia, j.aniversario_mes)), [juvenisAtivos]);
  const aniversariantesHoje = useMemo(() => juvenisAtivos.filter((j) => ehAniversarioHoje(j.aniversario_dia, j.aniversario_mes)), [juvenisAtivos]);
  const aniversariantesMes = useMemo(() => juvenisAtivos.filter((j) => ehAniversarioNoMes(j.aniversario_dia, j.aniversario_mes)), [juvenisAtivos]);

  const statsJuvenil = useMemo(() => {
    if (!juvenilAberto || historicoJuvenil.length === 0) return null;
    const total = historicoJuvenil.reduce((s, a) => s + calcularTotalLinha(a), 0);
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

  if (carregandoAuth) return <SkeletonScreen />;
  if (!userId) return <LoginScreen />;
  if (!profile) return <SkeletonScreen />;
  if (profile.must_change_password) {
    return (
      <TrocarSenhaScreen
        profile={profile}
        onSenhaAlterada={() => setProfile({ ...profile, must_change_password: false })}
      />
    );
  }
  if (carregando && juvenis.length === 0) return <SkeletonScreen />;

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 p-4 text-slate-100 sm:p-6">
      {/* Fundo decorativo */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-purple-600/10 blur-3xl" />
        <div className="absolute top-1/2 -right-40 h-96 w-96 rounded-full bg-fuchsia-600/10 blur-3xl" />
      </div>
      <div className="pointer-events-none absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "28px 28px" }} />

      {/* Toast */}
      {erroToast && (
        <div className="fixed bottom-4 right-4 z-[90] flex max-w-md items-center gap-3 rounded-2xl border border-red-500/40 bg-red-950/90 px-4 py-3 text-sm font-medium text-red-100 shadow-2xl backdrop-blur-lg">
          <span>⚠️</span>
          <span>{erroToast}</span>
          <button onClick={() => setErroToast(null)} className="rounded-lg p-1 text-red-200 transition hover:bg-red-900/50" aria-label="Fechar">✕</button>
        </div>
      )}

      <div className="relative z-10 mx-auto max-w-6xl">
        {/* Header */}
        <header className="mb-6 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="bg-gradient-to-r from-white via-purple-100 to-fuchsia-200 bg-clip-text text-3xl font-black tracking-tight text-transparent sm:text-4xl">
                Avaliação de Juvenis
              </h1>
              <p className="mt-1 text-xs font-medium text-slate-400">
                🎯 Pontuação máxima: <span className="font-bold text-purple-300">{PONTUACAO_MAXIMA} pontos</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Badge de status do salvamento em tempo real */}
              <div
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold backdrop-blur transition-all duration-300 ${
                  statusSalvamento === "salvando"
                    ? "border border-amber-500/30 bg-amber-500/10 text-amber-300 animate-pulse"
                    : statusSalvamento === "erro"
                    ? "border border-red-500/30 bg-red-500/10 text-red-300"
                    : "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                }`}
                title={
                  statusSalvamento === "salvando"
                    ? "Gravando notas no banco de dados..."
                    : statusSalvamento === "erro"
                    ? "Houve uma falha ao salvar as alterações."
                    : "Todas as alterações estão seguras e salvas."
                }
              >
                {statusSalvamento === "salvando" ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                    <span>Salvando...</span>
                  </>
                ) : statusSalvamento === "erro" ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-red-400" />
                    <span>Falha ao salvar</span>
                  </>
                ) : (
                  <>
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span className="hidden sm:inline">Salvo no banco</span>
                    <span className="sm:hidden">Salvo</span>
                  </>
                )}
              </div>

              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 backdrop-blur">
                <span className="text-sm">👤</span>
                <span>{profile.nome}</span>
              </span>
              <button onClick={fazerLogout} className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300 transition hover:bg-red-500/20">
                Sair
              </button>
            </div>
          </div>

          {/* Barra de ações */}
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-2 backdrop-blur">
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-xs">
              <span className="text-slate-400">📅</span>
              <input type="date" value={dataSelecionada} onChange={(e) => setDataSelecionada(e.target.value)} className="bg-transparent font-semibold text-slate-200 outline-none" />
            </label>
            <button onClick={() => setModalNovoAberto(true)} className="rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 px-3.5 py-2 text-xs font-bold text-white shadow-lg shadow-purple-500/20 transition hover:shadow-xl hover:shadow-fuchsia-500/30">
              ➕ Novo Juvenil
            </button>
            <button onClick={() => setModalGerenciarAberto(true)} className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10">
              ⚙️ Gerenciar
            </button>
            <Link href="/ranking" prefetch className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20">
              🏆 Ranking
            </Link>
            <Link href="/premiacoes" prefetch className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/20">
              🏅 Premiações
            </Link>
          </div>
        </header>

        {/* KPIs */}
        <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="relative overflow-hidden rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-500/10 to-slate-950/50 p-4 backdrop-blur">
            <div className="flex items-start justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-purple-300">Juvenis ativos</p>
              <span className="rounded-lg bg-purple-500/20 p-1.5 text-sm">👥</span>
            </div>
            <p className="mt-2 text-3xl font-black text-white">{juvenisAtivos.length}</p>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-slate-950/50 p-4 backdrop-blur">
            <div className="flex items-start justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">Presentes hoje</p>
              <span className="rounded-lg bg-emerald-500/20 p-1.5 text-sm">✅</span>
            </div>
            <p className="mt-2 text-3xl font-black text-white">
              {presentes}<span className="text-lg text-slate-500">/{juvenisAtivos.length}</span>
            </p>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-slate-950/50 p-4 backdrop-blur">
            <div className="flex items-start justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Aniversários do mês</p>
              <span className="rounded-lg bg-amber-500/20 p-1.5 text-sm">🎂</span>
            </div>
            <p className="mt-2 text-3xl font-black text-white">{aniversariantesMes.length}</p>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-500/10 to-slate-950/50 p-4 backdrop-blur">
            <div className="flex items-start justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-300">Líder do trimestre</p>
              <span className="rounded-lg bg-fuchsia-500/20 p-1.5 text-sm">🏆</span>
            </div>
            <p className="mt-2 truncate text-sm font-black text-white">
              {liderTrimestre ? `${liderTrimestre.nome.split(" ")[0]}` : "—"}
            </p>
            {liderTrimestre && (<p className="text-[10px] font-medium text-fuchsia-300">{liderTrimestre.total} pts</p>)}
          </div>
        </section>

        {/* Aviso aniversário */}
        {aniversariantesHoje.length > 0 ? (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-500/20 to-amber-600/10 px-4 py-3 backdrop-blur">
            <span className="text-2xl">🎉</span>
            <div>
              <p className="text-sm font-black text-amber-100">Hoje é aniversário de {aniversariantesHoje.map((j) => j.nome.split(" ")[0]).join(", ")}!</p>
              <p className="text-[11px] text-amber-200/80">Não esquece de parabenizar! 🎂</p>
            </div>
          </div>
        ) : aniversariantesSemana.length > 0 && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 backdrop-blur">
            <span className="text-lg">🎂</span>
            <p className="text-xs font-medium text-amber-200">
              Aniversariantes da semana: {aniversariantesSemana.map((j) => `${String(j.aniversario_dia).padStart(2, "0")}/${String(j.aniversario_mes).padStart(2, "0")} - ${j.nome.split(" ")[0]}`).join(" • ")}
            </p>
          </div>
        )}

        {/* Barra de presença em massa */}
        <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-purple-500/20 bg-gradient-to-r from-purple-500/10 to-fuchsia-500/5 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📋</span>
            <p className="text-sm font-semibold text-slate-200">
              Avaliando o sábado de <span className="text-purple-300">{formatarDataBR(dataSelecionada)}</span>
            </p>
          </div>
          <button onClick={alternarTodosPresentes} className={`rounded-xl px-3.5 py-1.5 text-xs font-bold text-white shadow-lg transition ${todosPresentes ? "bg-gradient-to-r from-red-600 to-red-500 shadow-red-500/20 hover:shadow-red-500/40" : "bg-gradient-to-r from-purple-600 to-fuchsia-600 shadow-purple-500/20 hover:shadow-fuchsia-500/40"}`}>
            {todosPresentes ? "❌ Desmarcar todos" : "✅ Marcar todos presentes"}
          </button>
        </div>

        {/* Chips de critérios */}
        <section className="mb-4 flex flex-wrap gap-2">
          {CRITERIOS.map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-slate-300 backdrop-blur">
              <span className="text-slate-400">{LABEL[c]}</span>
              <span className="rounded-full bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-bold text-purple-200">{SISTEMA_PONTOS[c]}</span>
            </span>
          ))}
        </section>

        {/* Cards mobile */}
        <section className="space-y-3 sm:hidden">
          {juvenisAtivos.map((j) => (
            <CardJuvenilMobile
              key={j.id}
              juvenil={j}
              row={avaliacoes[j.id]}
              total={calcularTotal(j.id)}
              onAlternarCriterio={alternarCriterio}
              onAbrirDetalhes={abrirDetalhesJuvenil}
            />
          ))}
        </section>

        {/* Tabela desktop */}
        <section className="hidden overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/80 to-slate-950/60 backdrop-blur sm:block">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-purple-500/5">
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-purple-300">#</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-purple-300">Juvenil</th>
                  {CRITERIOS.map((c) => (
                    <th key={c} className="px-2 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-purple-300">{LABEL[c]}</th>
                  ))}
                  <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-purple-300">Total</th>
                </tr>
              </thead>
              <tbody>
                {juvenisAtivos.map((j) => (
                  <LinhaJuvenilDesktop
                    key={j.id}
                    juvenil={j}
                    row={avaliacoes[j.id]}
                    total={calcularTotal(j.id)}
                    onAlternarCriterio={alternarCriterio}
                    onAbrirDetalhes={abrirDetalhesJuvenil}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Ranking */}
        {ranking.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-lg font-black text-slate-100">
              🏆 Ranking do sábado <span className="text-sm font-medium text-slate-500">({formatarDataBR(dataSelecionada)})</span>
            </h2>
            <ol className="space-y-2">
              {ranking.map((j, i) => (
                <li key={j.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 backdrop-blur transition hover:border-purple-500/30">
                  <span className="flex items-center gap-3">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-xl text-xs font-black ${i === 0 ? "bg-gradient-to-br from-yellow-400 to-amber-500 text-yellow-950 shadow-lg shadow-yellow-500/30" : i === 1 ? "bg-gradient-to-br from-slate-300 to-slate-400 text-slate-800 shadow-lg shadow-slate-400/20" : i === 2 ? "bg-gradient-to-br from-orange-400 to-orange-600 text-orange-950 shadow-lg shadow-orange-500/30" : "bg-white/5 text-slate-400"}`}>
                      {i + 1}
                    </span>
                    <span className="font-semibold text-slate-100">{j.nome}</span>
                  </span>
                  <span className="font-black text-purple-300">{j.total} pts</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Seção de Visitantes do Sábado */}
        <SecaoVisitantes dataSelecionada={dataSelecionada} formatarDataBR={formatarDataBR} />
      </div>

      {/* Modal Histórico */}
      {juvenilAberto && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-md" onClick={() => setJuvenilAberto(null)}>
          <div className="my-8 w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-slate-900 to-slate-950 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-white/10 p-5">
              <div>
                <h2 className="text-xl font-black text-slate-100">{juvenilAberto.nome}</h2>
                {juvenilAberto.aniversario_dia && juvenilAberto.aniversario_mes && (
                  <p className="text-xs text-slate-400">🎂 Aniversário: {String(juvenilAberto.aniversario_dia).padStart(2, "0")}/{String(juvenilAberto.aniversario_mes).padStart(2, "0")}</p>
                )}
              </div>
              <button onClick={() => setJuvenilAberto(null)} className="rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-slate-100" aria-label="Fechar">✕</button>
            </div>
            <div className="max-h-[75vh] overflow-y-auto p-5">
              {carregandoHistorico ? (
                <div className="py-12 text-center space-y-2">
                  <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
                  <p className="text-xs text-slate-400">Buscando histórico do ano...</p>
                </div>
              ) : historicoJuvenil.length === 0 ? (
                <p className="text-center text-sm text-slate-500">Nenhuma avaliação registrada ainda.</p>
              ) : (
                <>
                  {medalhasJuvenil.length > 0 && (
                    <section className="mb-5">
                      <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-purple-300">🏅 Conquistas</h3>
                      <div className="flex flex-wrap gap-2">
                        {medalhasJuvenil.map((m) => (
                          <div key={m.nome} className="flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-yellow-500/5 px-3 py-2 backdrop-blur" title={m.descricao}>
                            <span className="text-xl">{m.emoji}</span>
                            <div>
                              <p className="text-xs font-bold text-amber-200">{m.nome}</p>
                              <p className="text-[10px] text-amber-300/70">{m.descricao}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                  {statsJuvenil && (
                    <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Total de pontos</p>
                        <p className="mt-1 text-2xl font-black text-emerald-200">{statsJuvenil.total}</p>
                      </div>
                      <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Presenças</p>
                        <p className="mt-1 text-2xl font-black text-blue-200">{statsJuvenil.presencas}</p>
                      </div>
                      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-red-400">Faltas</p>
                        <p className="mt-1 text-2xl font-black text-red-200">{statsJuvenil.faltas}</p>
                      </div>
                      <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-purple-400">% Presença</p>
                        <p className="mt-1 text-2xl font-black text-purple-200">{statsJuvenil.percentual}%</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Média por sábado</p>
                        <p className="mt-1 text-2xl font-black text-slate-200">{statsJuvenil.media}</p>
                      </div>
                      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Recorde</p>
                        <p className="mt-1 text-2xl font-black text-amber-200">{statsJuvenil.recorde}</p>
                      </div>
                    </section>
                  )}
                  <section className="mb-5">
                    <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-purple-300">📈 Evolução por sábado</h3>
                    <div className="flex items-end gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-white/5 p-3">
                      {historicoJuvenil.map((a) => {
                        const t = calcularTotalLinha(a);
                        const alt = Math.max((t / PONTUACAO_MAXIMA) * 100, 4);
                        return (
                          <div key={a.data_avaliacao} className="flex flex-col items-center gap-1" style={{ minWidth: "28px" }} title={`${formatarDataBR(a.data_avaliacao)} — ${t} pts`}>
                            <span className="text-[10px] font-bold text-slate-400">{t}</span>
                            <div className={`w-5 rounded-t ${t === PONTUACAO_MAXIMA ? "bg-gradient-to-t from-emerald-600 to-emerald-400" : t >= 60 ? "bg-gradient-to-t from-amber-600 to-amber-400" : t > 0 ? "bg-gradient-to-t from-purple-600 to-purple-400" : "bg-red-500/60"}`} style={{ height: `${alt}px` }} />
                          </div>
                        );
                      })}
                    </div>
                  </section>
                  <section>
                    <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-purple-300">📅 Histórico do ano</h3>
                    <div className="overflow-x-auto rounded-2xl border border-white/10">
                      <table className="w-full min-w-[500px] border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-white/10 bg-purple-500/5">
                            <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-purple-300">Data</th>
                            <th className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-purple-300">Pontos</th>
                            <th className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-purple-300">Presente?</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...historicoJuvenil].reverse().map((a) => {
                            const t = calcularTotalLinha(a);
                            return (
                              <tr key={a.data_avaliacao} className="border-t border-white/5">
                                <td className="px-3 py-2 text-xs text-slate-300">{formatarDataBR(a.data_avaliacao)}</td>
                                <td className="px-3 py-2 text-center">
                                  <span className={`inline-block min-w-[2.5rem] rounded-full px-2 py-0.5 text-xs font-black ${t === PONTUACAO_MAXIMA ? "bg-emerald-500/20 text-emerald-300" : t >= 60 ? "bg-amber-500/20 text-amber-300" : t > 0 ? "bg-purple-500/20 text-purple-200" : "bg-white/5 text-slate-500"}`}>{t}</span>
                                </td>
                                <td className="px-3 py-2 text-center">{a.presenca ? "✅" : "❌"}</td>
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

      {modalNovoAberto && (<ModalNovoJuvenil onFechar={() => setModalNovoAberto(false)} onSalvo={() => { setModalNovoAberto(false); carregarJuvenis(); }} />)}
      {modalGerenciarAberto && (<ModalGerenciarJuvenis juvenis={juvenis} onFechar={() => setModalGerenciarAberto(false)} onAtualizado={() => carregarJuvenis()} />)}
      {mostrarAvisoInatividade && (
        <ModalAvisoInatividade segundos={segundosRestantes} onContinuar={() => { ultimaAtividade.current = Date.now(); mostrarAvisoInatividadeRef.current = false; setMostrarAvisoInatividade(false); setSegundosRestantes(Math.floor(TEMPO_AVISO_MS / 1000)); }} />
      )}
    </main>
  );
}