import { z } from "zod";

/** Domínio interno: a matrícula é a credencial, não existe e-mail real. */
const AUTH_EMAIL_DOMAIN = "segempat.local";

export const matriculaSchema = z
  .string()
  .trim()
  .min(1, "Informe sua matrícula")
  .max(32, "Matrícula muito longa")
  .regex(/^[A-Za-z0-9._-]+$/, "Use apenas letras, números, ponto, hífen ou underline");

/** Login deve aceitar senhas legadas já cadastradas, mesmo que tenham menos de 8 caracteres. */
export const loginPasswordSchema = z
  .string()
  .min(1, "Informe sua senha")
  .max(128, "Senha inválida");

/** Nova senha / primeiro acesso mantém a política mínima atual. */
export const passwordSchema = z
  .string()
  .min(8, "A senha deve ter pelo menos 8 caracteres")
  .max(72, "A senha deve ter no máximo 72 caracteres");

export const nomeSchema = z
  .string()
  .trim()
  .min(2, "Informe seu nome completo")
  .max(120, "Nome muito longo");

export function normalizeMatricula(matricula: string): string {
  return matricula.trim().toLowerCase();
}

export function matriculaToEmail(matricula: string): string {
  return `${normalizeMatricula(matricula)}@${AUTH_EMAIL_DOMAIN}`;
}
