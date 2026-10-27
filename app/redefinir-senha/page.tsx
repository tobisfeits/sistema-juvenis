"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { validarSenhaAmigavel } from "@/lib/auth-helpers";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

export default function RedefinirSenhaPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<"verificando" | "pronto" | "invalido" | "sucesso">("verificando");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;

    // Escuta evento de recuperação do Supabase Auth
    const { data: sub } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, currentSession: Session | null) => {
        if (!ativo) return;
        if (event === "PASSWORD_RECOVERY" || currentSession) {
          setSession(currentSession);
          setStatus("pronto");
        }
      }
    );

    // Verifica sessão existente ou hash na URL
    async function checarSessao() {
      const { data } = await supabase.auth.getSession();
      if (!ativo) return;

      if (data.session) {
        setSession(data.session);
        setStatus("pronto");
        return;
      }

      // Dá uma tolerância de 2.5s para o supabase client processar a hash da URL
      const timeout = setTimeout(() => {
        if (!ativo) return;
        setStatus((prev) => (prev === "verificando" ? "invalido" : prev));
      }, 2500);

      return () => clearTimeout(timeout);
    }

    checarSessao();

    return () => {
      ativo = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const erros = validarSenhaAmigavel(novaSenha);
  const senhaValida = novaSenha.length > 0 && erros.length === 0;
  const senhasIguais = novaSenha === confirmar && confirmar.length > 0;
  const ehFraseLonga = novaSenha.length >= 12;

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");

    if (!senhaValida) {
      setErro("A senha ainda não cumpre todos os requisitos amigáveis.");
      return;
    }
    if (!senhasIguais) {
      setErro("As duas senhas não coincidem.");
      return;
    }

    setSalvando(true);

    try {
      const { error: errorAuth } = await supabase.auth.updateUser({
        password: novaSenha,
      });

      if (errorAuth) {
        setErro("Não foi possível atualizar a senha: " + errorAuth.message);
        setSalvando(false);
        return;
      }

      // Se existir perfil vinculado com flag de troca pendente, removemos
      if (session?.user?.id) {
        try {
          await supabase
            .from("profiles")
            .update({ must_change_password: false })
            .eq("id", session.user.id);
        } catch {
          // opcional se a coluna/perfil não existir
        }
      }

      setStatus("sucesso");
      setTimeout(() => {
        router.push("/");
      }, 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErro("Erro inesperado: " + msg);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-4">
      {/* Luzes de fundo decorativas */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 animate-pulse rounded-full bg-purple-600/20 blur-3xl" />
        <div
          className="absolute -bottom-32 right-1/4 h-80 w-80 animate-pulse rounded-full bg-fuchsia-600/15 blur-3xl"
          style={{ animationDelay: "1.5s" }}
        />
      </div>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      <div className="relative z-10 w-full max-w-sm">
        <div className="animate-fade-in-lento relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-slate-900/90 to-slate-950/90 p-6 shadow-2xl backdrop-blur-xl">
          <div className="absolute -top-px left-1/2 h-px w-3/4 -translate-x-1/2 bg-gradient-to-r from-transparent via-purple-400 to-transparent" />

          <div className="mb-4 flex justify-center">
            <Image
              src="/soul-em-cristo.png"
              alt="Soul em Cristo"
              width={140}
              height={80}
              className="h-auto w-full max-w-[120px] drop-shadow-lg"
              priority
            />
          </div>

          {/* ESTADO 1: VERIFICANDO LINK */}
          {status === "verificando" && (
            <div className="py-8 text-center space-y-3">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-3 border-purple-400 border-t-transparent" />
              <p className="text-sm font-semibold text-slate-200">Validando link de recuperação...</p>
              <p className="text-xs text-slate-400">Aguarde um instante.</p>
            </div>
          )}

          {/* ESTADO 2: LINK INVÁLIDO OU EXPIRADO */}
          {status === "invalido" && (
            <div className="text-center space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-950/50 border border-red-500/30 text-2xl">
                ⚠️
              </div>
              <div>
                <h1 className="text-lg font-black text-white">Link expirado ou inválido</h1>
                <p className="mt-1 text-xs text-slate-400">
                  Por segurança, os links de redefinição têm prazo de validade curto ou já foram utilizados.
                </p>
              </div>
              <Link
                href="/"
                className="block w-full rounded-2xl bg-white/10 hover:bg-white/15 px-4 py-3 text-sm font-bold text-white transition"
              >
                ← Voltar ao login e solicitar outro
              </Link>
            </div>
          )}

          {/* ESTADO 3: FORMULÁRIO DE NOVA SENHA */}
          {status === "pronto" && (
            <>
              <div className="mb-5 text-center">
                <h1 className="text-xl font-black tracking-tight text-white">Criar nova senha 🔐</h1>
                <p className="mt-1 text-xs font-medium text-slate-400">
                  Defina uma senha pessoal para acessar o sistema
                </p>
              </div>

              <form onSubmit={handleSalvar} className="space-y-3.5">
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-purple-300">
                    Nova Senha
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base">
                      🔑
                    </span>
                    <input
                      type={mostrarSenha ? "text" : "password"}
                      value={novaSenha}
                      onChange={(e) => setNovaSenha(e.target.value)}
                      placeholder="Ex: frase fácil de lembrar ou 8+ caracteres"
                      autoComplete="new-password"
                      required
                      className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-11 text-sm text-slate-100 placeholder-slate-500 outline-none transition-all focus:border-purple-400 focus:bg-white/10 focus:ring-2 focus:ring-purple-500/30"
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarSenha(!mostrarSenha)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-base opacity-60 transition hover:opacity-100"
                      aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {mostrarSenha ? "🙈" : "👁️"}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-fuchsia-300">
                    Confirmar Senha
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base">
                      ✅
                    </span>
                    <input
                      type={mostrarSenha ? "text" : "password"}
                      value={confirmar}
                      onChange={(e) => setConfirmar(e.target.value)}
                      placeholder="Repita a nova senha"
                      autoComplete="new-password"
                      required
                      className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-3 text-sm text-slate-100 placeholder-slate-500 outline-none transition-all focus:border-fuchsia-400 focus:bg-white/10 focus:ring-2 focus:ring-fuchsia-500/30"
                    />
                  </div>
                </div>

                {/* Guia Amigável de Requisitos */}
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                    💡 Dica de Senha Amigável
                  </p>
                  <ul className="space-y-1 text-[11px]">
                    <li
                      className={`flex items-center gap-1.5 font-medium ${
                        novaSenha.length >= 8 ? "text-emerald-400" : "text-slate-500"
                      }`}
                    >
                      <span>{novaSenha.length >= 8 ? "✓" : "○"}</span>
                      <span>Mínimo de 8 caracteres</span>
                    </li>
                    <li
                      className={`flex items-center gap-1.5 font-medium ${
                        ehFraseLonga
                          ? "text-purple-300"
                          : /[A-Za-z]/.test(novaSenha) && /[0-9]/.test(novaSenha)
                          ? "text-emerald-400"
                          : "text-slate-500"
                      }`}
                    >
                      <span>{ehFraseLonga || (/[A-Za-z]/.test(novaSenha) && /[0-9]/.test(novaSenha)) ? "✓" : "○"}</span>
                      <span>
                        {ehFraseLonga
                          ? "✨ Frase-senha longa (12+ caracteres) aprovada!"
                          : "Letra e número (ou use uma frase de 12+ caracteres)"}
                      </span>
                    </li>
                    {confirmar.length > 0 && (
                      <li
                        className={`flex items-center gap-1.5 font-medium ${
                          senhasIguais ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        <span>{senhasIguais ? "✓" : "✕"}</span>
                        <span>{senhasIguais ? "Senhas coincidem" : "Senhas diferentes"}</span>
                      </li>
                    )}
                  </ul>
                </div>

                {erro && (
                  <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-950/40 px-3 py-2.5 text-xs font-medium text-red-300">
                    <span>⚠️</span>
                    <span>{erro}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={salvando || !senhaValida || !senhasIguais}
                  className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-purple-600 to-fuchsia-600 px-4 py-3.5 text-sm font-black text-white shadow-lg shadow-purple-500/30 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-fuchsia-500/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-fuchsia-600 to-purple-600 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <span className="relative flex items-center justify-center gap-2">
                    {salvando ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Salvando nova senha...
                      </>
                    ) : (
                      <>Salvar nova senha e entrar →</>
                    )}
                  </span>
                </button>
              </form>
            </>
          )}

          {/* ESTADO 4: SUCESSO */}
          {status === "sucesso" && (
            <div className="text-center space-y-4 py-2">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-950/50 border border-emerald-500/40 text-3xl">
                🎉
              </div>
              <div>
                <h1 className="text-xl font-black text-white">Senha alterada com sucesso!</h1>
                <p className="mt-1.5 text-xs text-slate-300">
                  Seu novo acesso já está ativo. Redirecionando para o sistema...
                </p>
              </div>
              <Link
                href="/"
                className="block w-full rounded-2xl bg-gradient-to-r from-purple-600 to-fuchsia-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-purple-500/30 transition hover:shadow-xl"
              >
                Acessar o sistema agora →
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
