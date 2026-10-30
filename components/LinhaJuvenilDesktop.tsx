// components/LinhaJuvenilDesktop.tsx
"use client";

import React from "react";
import type { Juvenil, AvaliacaoRow, Criterio } from "@/types";
import { CRITERIOS, LABEL, PONTUACAO_MAXIMA } from "@/types";

interface LinhaJuvenilDesktopProps {
  juvenil: Juvenil;
  row?: AvaliacaoRow;
  total: number;
  onAlternarCriterio: (juvenilId: number, criterio: Criterio) => void;
  onAbrirDetalhes: (juvenil: Juvenil) => void;
}

export const LinhaJuvenilDesktop = React.memo(function LinhaJuvenilDesktop({
  juvenil,
  row,
  total,
  onAlternarCriterio,
  onAbrirDetalhes,
}: LinhaJuvenilDesktopProps) {
  const temPresenca = row?.presenca ?? false;

  return (
    <tr className="border-b border-white/5 transition hover:bg-purple-500/5">
      <td className="px-4 py-3 text-xs text-slate-500">{juvenil.id}</td>
      <td className="px-4 py-3">
        <button
          onClick={() => onAbrirDetalhes(juvenil)}
          className="text-left text-sm font-semibold text-slate-100 transition hover:text-purple-300"
          title="Ver histórico e medalhas"
        >
          {juvenil.nome}
        </button>
      </td>
      {CRITERIOS.map((c) => {
        const isPresenca = c === "presenca";
        const marcado = row?.[c] ?? false;
        const desabilitado = !isPresenca && !temPresenca;
        return (
          <td key={c} className="px-2 py-3 text-center">
            <label
              className={`inline-flex cursor-pointer items-center justify-center ${
                desabilitado ? "cursor-not-allowed opacity-30" : ""
              }`}
              title={desabilitado ? "Marque a presença primeiro" : LABEL[c]}
            >
              <input
                type="checkbox"
                checked={marcado}
                disabled={desabilitado}
                onChange={() => onAlternarCriterio(juvenil.id, c)}
                className="h-5 w-5 cursor-pointer rounded border-slate-600 bg-white/5 text-purple-600 focus:ring-purple-500 disabled:cursor-not-allowed"
                aria-label={`${LABEL[c]} — ${juvenil.nome}`}
              />
            </label>
          </td>
        );
      })}
      <td className="px-4 py-3 text-center">
        <span
          className={`inline-block min-w-[3rem] rounded-full px-2.5 py-1 text-xs font-black ${
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
      </td>
    </tr>
  );
});

