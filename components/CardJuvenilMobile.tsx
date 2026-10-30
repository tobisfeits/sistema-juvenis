// components/CardJuvenilMobile.tsx
"use client";

import React from "react";
import type { Juvenil, AvaliacaoRow, Criterio } from "@/types";
import { CRITERIOS, LABEL, PONTUACAO_MAXIMA } from "@/types";

interface CardJuvenilMobileProps {
  juvenil: Juvenil;
  row?: AvaliacaoRow;
  total: number;
  onAlternarCriterio: (juvenilId: number, criterio: Criterio) => void;
  onAbrirDetalhes: (juvenil: Juvenil) => void;
}

export const CardJuvenilMobile = React.memo(function CardJuvenilMobile({
  juvenil,
  row,
  total,
  onAlternarCriterio,
  onAbrirDetalhes,
}: CardJuvenilMobileProps) {
  const temPresenca = row?.presenca ?? false;
  const initials = juvenil.nome
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/80 to-slate-950/60 p-4 backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white shadow-lg ${
              total === PONTUACAO_MAXIMA
                ? "bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/30"
                : total >= 60
                ? "bg-gradient-to-br from-amber-500 to-amber-600 shadow-amber-500/30"
                : "bg-gradient-to-br from-purple-500 to-fuchsia-500 shadow-purple-500/30"
            }`}
          >
            {initials}
          </div>
          <button
            onClick={() => onAbrirDetalhes(juvenil)}
            className="text-left text-sm font-bold text-slate-100 transition hover:text-purple-300"
          >
            {juvenil.nome}
          </button>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${
            total === PONTUACAO_MAXIMA
              ? "bg-emerald-500/20 text-emerald-300"
              : total >= 60
              ? "bg-amber-500/20 text-amber-300"
              : total > 0
              ? "bg-purple-500/20 text-purple-200"
              : "bg-white/5 text-slate-500"
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
              className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs transition ${
                marcado
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  : desabilitado
                  ? "cursor-not-allowed border-white/5 bg-white/[0.02] text-slate-600"
                  : "border-white/10 bg-white/5 text-slate-300 hover:border-purple-500/30"
              }`}
            >
              <input
                type="checkbox"
                checked={marcado}
                disabled={desabilitado}
                onChange={() => onAlternarCriterio(juvenil.id, c)}
                className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-600 text-purple-600 focus:ring-purple-500 disabled:cursor-not-allowed"
              />
              <span className="truncate font-medium">{LABEL[c]}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
});

