// types/index.ts

export type Juvenil = {
  id: number;
  nome: string;
  aniversario_dia: number | null;
  aniversario_mes: number | null;
  ativo: boolean | null;
};

export const SISTEMA_PONTOS = {
  presenca: 20,
  pontualidade: 10,
  participacao: 10,
  estudo_licao: 25,
  verso_aureo: 20,
  biblia: 15,
} as const;

export type Criterio = keyof typeof SISTEMA_PONTOS;
export const CRITERIOS = Object.keys(SISTEMA_PONTOS) as Criterio[];

export const PONTUACAO_MAXIMA = CRITERIOS.reduce(
  (soma, c) => soma + SISTEMA_PONTOS[c],
  0
);

export const LABEL: Record<Criterio, string> = {
  presenca: "Presença",
  pontualidade: "Pontualidade",
  participacao: "Participação",
  estudo_licao: "Estudo da Lição",
  verso_aureo: "Verso Áureo",
  biblia: "Bíblia",
};

export type AvaliacaoRow = {
  id?: number;
  juvenil_id: number;
  data_avaliacao: string;
  presenca: boolean;
  pontualidade: boolean;
  participacao: boolean;
  estudo_licao: boolean;
  verso_aureo: boolean;
  biblia: boolean;
  atualizado_por?: string | null;
  updated_at?: string | null;
};

export type Profile = {
  id: string;
  nome: string;
  email: string;
  username: string | null;
  must_change_password: boolean;
};

export type Medalha = {
  emoji: string;
  nome: string;
  descricao: string;
};

