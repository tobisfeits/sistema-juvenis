// lib/auth-helpers.ts

/**
 * Mapeamento de usuários/apelidos para seus e-mails reais cadastrados.
 * O login agora tem como regra oficial o uso do E-MAIL.
 */
export const USUARIOS_EMAILS: Record<string, string> = {
  tobias: "tobias.feitosa@gmail.com",
  bianca: "biviamorim@gmail.com",
  cleide: "cleidemjsm@gmail.com",
};

/**
 * Resolve o identificador (e-mail ou usuário legado) para um e-mail válido.
 */
export function resolverEmail(usuarioOuEmail: string): string {
  const limpo = usuarioOuEmail.trim().toLowerCase();
  if (limpo.includes("@")) return limpo;
  if (USUARIOS_EMAILS[limpo]) return USUARIOS_EMAILS[limpo];
  return `${limpo}@soul.local`;
}

/**
 * Política de senhas moderna e amigável (NIST SP 800-63B):
 * 1. Frases-senha longas (12+ caracteres) são sempre válidas e não exigem símbolos chatos.
 * 2. Senhas comuns (8 a 11 caracteres) exigem ao menos letras e números.
 * 3. Proíbe apenas o próprio nome do usuário para evitar senhas triviais.
 */
export function validarSenhaAmigavel(senha: string, nomeUsuario?: string): string[] {
  const erros: string[] = [];
  const ehFraseLonga = senha.length >= 12;

  if (senha.length < 8) {
    erros.push("Mínimo de 8 caracteres");
  }

  // Se não for frase longa (12+), pede apenas letra e número básicos
  if (!ehFraseLonga) {
    if (!/[A-Za-z]/.test(senha)) erros.push("Pelo menos 1 letra");
    if (!/[0-9]/.test(senha)) erros.push("Pelo menos 1 número");
  }

  if (nomeUsuario && nomeUsuario.length >= 3 && senha.toLowerCase().includes(nomeUsuario.toLowerCase())) {
    erros.push(`Não pode conter seu nome ("${nomeUsuario}")`);
  }

  return erros;
}

