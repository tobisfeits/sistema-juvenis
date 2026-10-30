// components/SeletorSabados.tsx
"use client";

import React, { useMemo } from "react";
import {
  ehSabado,
  formatarDataISO,
  listarSabadosRecentes,
  obterSabadoPadrao,
  parseDataISO,
  proximoSabado,
  sabadoAnterior,
} from "@/lib/date-helpers";

interface SeletorSabadosProps {
  dataSelecionada: string;
  onSelecionarData: (novaData: string) => void;
}

export function SeletorSabados({
  dataSelecionada,
  onSelecionarData,
}: SeletorSabadosProps) {
  const sabadosRecentes = useMemo(() => listarSabadosRecentes(10), []);

  const handleDataManual = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) return;

    if (!ehSabado(val)) {
      // Se a pessoa clicou em um dia que não é sábado, ajusta automaticamente para o sábado mais próximo
      const d = parseDataISO(val);
      const diaSemana = d.getDay();
      const diff = 6 - diaSemana; // dias até sábado
      d.setDate(d.getDate() + diff);
      const ajustado = formatarDataISO(d);
      alert(
        `Atenção: A data selecionada (${val.split("-").reverse().join("/")}) não é um sábado.\n\nAjustamos automaticamente para o sábado correspondente: ${ajustado.split("-").reverse().join("/")}.`
      );
      onSelecionarData(ajustado);
      return;
    }

    onSelecionarData(val);
  };

  const sabadoAtualPadrao = useMemo(() => obterSabadoPadrao(), []);
  const ehRetroativo = dataSelecionada < sabadoAtualPadrao;
  const ehHoje = dataSelecionada === formatarDataISO(new Date()) && ehSabado(dataSelecionada);

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-slate-950/60 p-1 backdrop-blur">
      {/* Botão Sábado Anterior */}
      <button
        type="button"
        onClick={() => onSelecionarData(sabadoAnterior(dataSelecionada))}
        className="rounded-lg border border-white/5 bg-white/5 px-2 py-1.5 text-xs font-bold text-slate-300 transition hover:bg-white/10 hover:text-white"
        title="Voltar 1 sábado"
      >
        ◀
      </button>

      {/* Select de Sábados Rápidos */}
      <div className="relative">
        <select
          value={dataSelecionada}
          onChange={(e) => onSelecionarData(e.target.value)}
          className="appearance-none rounded-lg border border-purple-500/30 bg-purple-950/30 py-1.5 pl-7 pr-7 text-xs font-bold text-purple-200 outline-none transition hover:border-purple-400 focus:border-purple-400 focus:ring-1 focus:ring-purple-400"
        >
          {sabadosRecentes.map((s) => (
            <option key={s.iso} value={s.iso} className="bg-slate-900 text-slate-100">
              {s.label}
            </option>
          ))}
          {!sabadosRecentes.some((s) => s.iso === dataSelecionada) && (
            <option value={dataSelecionada} className="bg-slate-900 text-purple-300 font-bold">
              Sábado • {dataSelecionada.split("-").reverse().join("/")} (Outro)
            </option>
          )}
        </select>
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs">
          📅
        </span>
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-purple-400">
          ▼
        </span>
      </div>

      {/* Botão Próximo Sábado */}
      <button
        type="button"
        onClick={() => onSelecionarData(proximoSabado(dataSelecionada))}
        className="rounded-lg border border-white/5 bg-white/5 px-2 py-1.5 text-xs font-bold text-slate-300 transition hover:bg-white/10 hover:text-white"
        title="Avançar 1 sábado"
      >
        ▶
      </button>

      {/* Seletor calendário auxiliar caso queira escolher qualquer sábado do ano */}
      <label
        className="relative cursor-pointer rounded-lg border border-white/5 bg-white/5 px-2 py-1.5 text-xs text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
        title="Escolher outro sábado no calendário"
      >
        <span className="text-xs">🗓️</span>
        <input
          type="date"
          value={dataSelecionada}
          onChange={handleDataManual}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>

      {/* Status da data */}
      {ehHoje ? (
        <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-300">
          Hoje
        </span>
      ) : ehRetroativo ? (
        <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-300">
          Retroativo
        </span>
      ) : null}
    </div>
  );
}
