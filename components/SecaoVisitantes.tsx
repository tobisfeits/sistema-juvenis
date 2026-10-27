"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";

export type Visitante = {
  id: number;
  nome: string;
  data_primeira_visita: string;
  classe_faixa: string | null;
  quem_convidou: string | null;
  contato: string | null;
  observacao: string | null;
};

export type VisitaPresenca = {
  id: number;
  visitante_id: number;
  data_visita: string;
  trouxe_biblia: boolean;
  trouxe_licao: boolean;
  observacao: string | null;
  visitante: Visitante;
};

interface SecaoVisitantesProps {
  dataSelecionada: string;
  formatarDataBR: (iso: string) => string;
}

export function SecaoVisitantes({ dataSelecionada, formatarDataBR }: SecaoVisitantesProps) {
  const supabase = useMemo(() => createClient(), []);

  const [visitasHoje, setVisitasHoje] = useState<VisitaPresenca[]>([]);
  const [todosVisitantes, setTodosVisitantes] = useState<Visitante[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);

  // Estados do formulário do modal
  const [abaModal, setAbaModal] = useState<"existente" | "novo">("novo");
  const [visitanteExistenteId, setVisitanteExistenteId] = useState<string>("");
  const [nomeNovo, setNomeNovo] = useState("");
  const [quemConvidou, setQuemConvidou] = useState("");
  const [contato, setContato] = useState("");
  const [observacao, setObservacao] = useState("");
  const [trouxeBiblia, setTrouxeBiblia] = useState(false);
  const [trouxeLicao, setTrouxeLicao] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroModal, setErroModal] = useState("");

  const carregarVisitas = useCallback(async () => {
    setCarregando(true);
    const { data, error } = await supabase
      .from("visitas_presencas")
      .select("id, visitante_id, data_visita, trouxe_biblia, trouxe_licao, observacao, visitante:visitantes(id, nome, data_primeira_visita, classe_faixa, quem_convidou, contato, observacao)")
      .eq("data_visita", dataSelecionada)
      .order("id", { ascending: true });

    if (error) {
      console.error("Erro ao carregar visitas:", error);
    } else {
      // Cast defensivo para o formato esperado
      const formatados = (data ?? []).map((row: any) => ({
        ...row,
        visitante: Array.isArray(row.visitante) ? row.visitante[0] : row.visitante,
      })) as VisitaPresenca[];
      setVisitasHoje(formatados);
    }
    setCarregando(false);
  }, [dataSelecionada, supabase]);

  const carregarTodosVisitantes = useCallback(async () => {
    const { data } = await supabase
      .from("visitantes")
      .select("*")
      .order("nome", { ascending: true });
    setTodosVisitantes(data ?? []);
  }, [supabase]);

  useEffect(() => {
    carregarVisitas();
  }, [carregarVisitas]);

  useEffect(() => {
    if (modalAberto) {
      carregarTodosVisitantes();
      setErroModal("");
    }
  }, [modalAberto, carregarTodosVisitantes]);

  const alternarBiblia = async (visita: VisitaPresenca) => {
    const novoStatus = !visita.trouxe_biblia;
    setVisitasHoje((prev) =>
      prev.map((v) => (v.id === visita.id ? { ...v, trouxe_biblia: novoStatus } : v))
    );
    await supabase
      .from("visitas_presencas")
      .update({ trouxe_biblia: novoStatus })
      .eq("id", visita.id);
  };

  const alternarLicao = async (visita: VisitaPresenca) => {
    const novoStatus = !visita.trouxe_licao;
    setVisitasHoje((prev) =>
      prev.map((v) => (v.id === visita.id ? { ...v, trouxe_licao: novoStatus } : v))
    );
    await supabase
      .from("visitas_presencas")
      .update({ trouxe_licao: novoStatus })
      .eq("id", visita.id);
  };

  const removerVisita = async (visita: VisitaPresenca) => {
    if (!confirm(`Remover a presença de ${visita.visitante?.nome || "visitante"} neste sábado?`)) return;
    setVisitasHoje((prev) => prev.filter((v) => v.id !== visita.id));
    await supabase.from("visitas_presencas").delete().eq("id", visita.id);
  };

  const handleSalvarVisita = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroModal("");
    setSalvando(true);

    try {
      let vId: number;

      if (abaModal === "novo") {
        if (nomeNovo.trim().length < 2) {
          setErroModal("Informe o nome completo do visitante.");
          setSalvando(false);
          return;
        }

        const { data: novoV, error: erroV } = await supabase
          .from("visitantes")
          .insert({
            nome: nomeNovo.trim(),
            data_primeira_visita: dataSelecionada,
            classe_faixa: "Juvenis",
            quem_convidou: quemConvidou.trim() || null,
            contato: contato.trim() || null,
            observacao: observacao.trim() || null,
          })
          .select("id")
          .single();

        if (erroV || !novoV) {
          setErroModal("Erro ao cadastrar visitante: " + (erroV?.message || ""));
          setSalvando(false);
          return;
        }
        vId = novoV.id;
      } else {
        if (!visitanteExistenteId) {
          setErroModal("Selecione um visitante já cadastrado.");
          setSalvando(false);
          return;
        }
        vId = Number(visitanteExistenteId);
      }

      // Insere o registro de presença da visita para a data selecionada
      const { error: erroP } = await supabase.from("visitas_presencas").upsert(
        {
          visitante_id: vId,
          data_visita: dataSelecionada,
          trouxe_biblia: trouxeBiblia,
          trouxe_licao: trouxeLicao,
          observacao: observacao.trim() || null,
        },
        { onConflict: "visitante_id,data_visita" }
      );

      if (erroP) {
        setErroModal("Erro ao registrar presença do visitante: " + erroP.message);
        setSalvando(false);
        return;
      }

      // Limpa formulário e fecha modal
      setNomeNovo("");
      setQuemConvidou("");
      setContato("");
      setObservacao("");
      setVisitanteExistenteId("");
      setTrouxeBiblia(false);
      setTrouxeLicao(false);
      setModalAberto(false);
      await carregarVisitas();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErroModal("Erro inesperado: " + msg);
    } finally {
      setSalvando(false);
    }
  };

  // Visitantes que ainda não estão presentes hoje (para o select)
  const visitantesDisponiveis = useMemo(() => {
    const presentesIds = new Set(visitasHoje.map((v) => v.visitante_id));
    return todosVisitantes.filter((v) => !presentesIds.has(v.id));
  }, [todosVisitantes, visitasHoje]);

  return (
    <section className="mt-8 rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/90 to-slate-950/90 p-5 shadow-2xl backdrop-blur-xl">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-fuchsia-500/20 text-xl border border-fuchsia-500/30">
            👥
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-white">Visitantes do Sábado</h2>
              <span className="rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-xs font-bold text-fuchsia-300">
                {visitasHoje.length} {visitasHoje.length === 1 ? "visitante" : "visitantes"}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Presenças de convidados e retornos em {formatarDataBR(dataSelecionada)}
            </p>
          </div>
        </div>
        <button
          onClick={() => setModalAberto(true)}
          className="rounded-2xl bg-gradient-to-r from-fuchsia-600 to-purple-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-fuchsia-500/20 transition hover:scale-[1.02] hover:shadow-xl hover:shadow-purple-500/30 active:scale-[0.98]"
        >
          ➕ Adicionar Visitante
        </button>
      </div>

      {carregando ? (
        <div className="py-6 text-center text-xs text-slate-500 animate-pulse">
          Carregando visitantes do sábado...
        </div>
      ) : visitasHoje.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center">
          <p className="text-sm font-semibold text-slate-400">Nenhum visitante registrado neste sábado.</p>
          <p className="mt-1 text-xs text-slate-500">
            Clique em &quot;Adicionar Visitante&quot; para registrar novos amigos ou retornos da classe.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <th className="py-2.5 px-3">Nome</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-center">Bíblia</th>
                <th className="py-2.5 px-3 text-center">Lição</th>
                <th className="py-2.5 px-3">Quem convidou</th>
                <th className="py-2.5 px-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {visitasHoje.map((v) => {
                const ehRetorno = v.visitante?.data_primeira_visita
                  ? v.data_visita > v.visitante.data_primeira_visita
                  : false;

                return (
                  <tr key={v.id} className="transition hover:bg-white/[0.02]">
                    <td className="py-3 px-3">
                      <p className="font-bold text-slate-100">{v.visitante?.nome ?? "Visitante"}</p>
                      {v.observacao && (
                        <p className="text-[11px] text-slate-500 italic">Obs: {v.observacao}</p>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {ehRetorno ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
                          🔄 Retorno
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-0.5 text-[10px] font-bold text-purple-300">
                          ✨ 1ª Visita
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => alternarBiblia(v)}
                        className={`rounded-xl px-2.5 py-1 text-xs font-bold transition ${
                          v.trouxe_biblia
                            ? "bg-purple-500 text-white shadow-md shadow-purple-500/30"
                            : "bg-white/5 text-slate-500 hover:bg-white/10"
                        }`}
                      >
                        {v.trouxe_biblia ? "📖 Sim" : "○ Não"}
                      </button>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => alternarLicao(v)}
                        className={`rounded-xl px-2.5 py-1 text-xs font-bold transition ${
                          v.trouxe_licao
                            ? "bg-fuchsia-500 text-white shadow-md shadow-fuchsia-500/30"
                            : "bg-white/5 text-slate-500 hover:bg-white/10"
                        }`}
                      >
                        {v.trouxe_licao ? "📝 Sim" : "○ Não"}
                      </button>
                    </td>
                    <td className="py-3 px-3 text-xs text-slate-300">
                      {v.visitante?.quem_convidou || "—"}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => removerVisita(v)}
                        className="rounded-lg p-1.5 text-xs text-slate-500 transition hover:bg-red-500/20 hover:text-red-400"
                        title="Remover presença deste sábado"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL ADICIONAR VISITANTE */}
      {modalAberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          onClick={() => setModalAberto(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-white/10 bg-gradient-to-b from-slate-900 to-slate-950 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-black text-white">✨ Registrar Visitante</h3>
                <p className="text-xs text-slate-400">
                  Presença em {formatarDataBR(dataSelecionada)}
                </p>
              </div>
              <button
                onClick={() => setModalAberto(false)}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-slate-100"
              >
                ✕
              </button>
            </div>

            {/* Alternar abas */}
            <div className="mb-4 flex rounded-xl border border-white/10 bg-white/5 p-1">
              <button
                type="button"
                onClick={() => setAbaModal("novo")}
                className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition ${
                  abaModal === "novo"
                    ? "bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Novo Visitante
              </button>
              <button
                type="button"
                onClick={() => setAbaModal("existente")}
                className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition ${
                  abaModal === "existente"
                    ? "bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Já Cadastrado (Retorno)
              </button>
            </div>

            <form onSubmit={handleSalvarVisita} className="space-y-3.5">
              {abaModal === "novo" ? (
                <>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-fuchsia-300">
                      Nome Completo *
                    </label>
                    <input
                      type="text"
                      value={nomeNovo}
                      onChange={(e) => setNomeNovo(e.target.value)}
                      placeholder="Ex: Laura Silva"
                      required
                      autoFocus
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-fuchsia-400 focus:bg-white/10 focus:ring-2 focus:ring-fuchsia-500/30"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-purple-300">
                        Quem convidou?
                      </label>
                      <input
                        type="text"
                        value={quemConvidou}
                        onChange={(e) => setQuemConvidou(e.target.value)}
                        placeholder="Ex: Catarina"
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-purple-400"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-purple-300">
                        Contato / Telefone
                      </label>
                      <input
                        type="text"
                        value={contato}
                        onChange={(e) => setContato(e.target.value)}
                        placeholder="Opcional"
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-purple-400"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-fuchsia-300">
                    Selecione o Visitante *
                  </label>
                  {visitantesDisponiveis.length === 0 ? (
                    <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-400">
                      Nenhum outro visitante cadastrado disponível para este sábado.
                    </p>
                  ) : (
                    <select
                      value={visitanteExistenteId}
                      onChange={(e) => setVisitanteExistenteId(e.target.value)}
                      required
                      className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-fuchsia-400"
                    >
                      <option value="">Selecione um nome...</option>
                      {visitantesDisponiveis.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.nome} (1ª visita em: {formatarDataBR(v.data_primeira_visita)})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Opções de pontuação do visitante */}
              <div className="flex gap-4 rounded-xl border border-white/10 bg-white/5 p-3">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={trouxeBiblia}
                    onChange={(e) => setTrouxeBiblia(e.target.checked)}
                    className="h-4 w-4 rounded accent-purple-500"
                  />
                  <span>📖 Trouxe Bíblia</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={trouxeLicao}
                    onChange={(e) => setTrouxeLicao(e.target.checked)}
                    className="h-4 w-4 rounded accent-fuchsia-500"
                  />
                  <span>📝 Trouxe Lição</span>
                </label>
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Observações (opcional)
                </label>
                <input
                  type="text"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Ex: Veio com a família, gostou da classe..."
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-purple-400"
                />
              </div>

              {erroModal && (
                <div className="rounded-xl border border-red-500/30 bg-red-950/40 p-2.5 text-xs text-red-300">
                  ⚠️ {erroModal}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalAberto(false)}
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2.5 text-xs font-semibold text-slate-300 transition hover:bg-white/10"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando || (abaModal === "existente" && !visitanteExistenteId)}
                  className="flex-1 rounded-xl bg-gradient-to-r from-fuchsia-600 to-purple-600 py-2.5 text-xs font-bold text-white shadow-lg shadow-fuchsia-500/30 transition hover:shadow-xl disabled:opacity-50"
                >
                  {salvando ? "Salvando..." : "Confirmar Presença"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

