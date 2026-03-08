import { z } from "zod";

export const EMAIL_MAX_LENGTH = 320;
export const PERSON_NAME_MAX_LENGTH = 120;
export const ORGANIZATION_NAME_MAX_LENGTH = 120;
export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_POLICY_HINT =
  "Usa una frase de al menos 15 caracteres. Evita claves comunes y datos obvios como tu email, nombre u organizacion.";

const CONTROL_CHARACTERS_REGEX = /[\u0000-\u001F\u007F]/g;
const MULTIPLE_WHITESPACE_REGEX = /\s+/g;
const REPEATED_CHARACTER_PASSWORD_REGEX = /^(.)\1{7,}$/;
const COMMON_PASSWORDS = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "admin123",
  "agentbuilder",
  "agentbuilder123",
  "changeme",
  "contraseña",
  "contrasena",
  "letmein",
  "password",
  "password1",
  "qwerty123",
  "welcome123",
]);

type PasswordContext = {
  email?: string;
  fullName?: string;
  organizationName?: string;
};

function getRequiredTextSchema(label: string, maxLength: number) {
  return z
    .string()
    .transform(sanitizeTextInput)
    .pipe(
      z
        .string()
        .min(1, `El ${label} es requerido`)
        .max(maxLength, `El ${label} no puede superar ${maxLength} caracteres`)
    );
}

function getPasswordTokens(context: PasswordContext): string[] {
  const emailLocalPart = normalizeEmail(context.email ?? "").split("@")[0] ?? "";

  return [emailLocalPart, context.fullName ?? "", context.organizationName ?? ""]
    .flatMap((value) =>
      sanitizeTextInput(value)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 4)
    );
}

export function sanitizeTextInput(value: string): string {
  return value
    .normalize("NFKC")
    .replace(CONTROL_CHARACTERS_REGEX, "")
    .replace(MULTIPLE_WHITESPACE_REGEX, " ")
    .trim();
}

export function normalizeEmail(value: string): string {
  return sanitizeTextInput(value).toLowerCase();
}

export function getPasswordValidationError(
  password: string,
  context: PasswordContext = {}
): string | null {
  const normalizedPassword = password.normalize("NFKC");
  const loweredPassword = normalizedPassword.toLowerCase();

  if (normalizedPassword.trim().length === 0) {
    return "La contrasena no puede estar vacia ni contener solo espacios";
  }

  if (normalizedPassword.length < PASSWORD_MIN_LENGTH) {
    return `La contrasena debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`;
  }

  if (normalizedPassword.length > PASSWORD_MAX_LENGTH) {
    return `La contrasena no puede superar ${PASSWORD_MAX_LENGTH} caracteres`;
  }

  if (COMMON_PASSWORDS.has(loweredPassword)) {
    return "La contrasena es demasiado comun. Elige una frase unica.";
  }

  if (REPEATED_CHARACTER_PASSWORD_REGEX.test(normalizedPassword)) {
    return "La contrasena no puede estar formada por el mismo caracter repetido.";
  }

  const contextualTokens = getPasswordTokens(context);

  if (contextualTokens.some((token) => loweredPassword.includes(token))) {
    return "La contrasena no debe incluir datos faciles de adivinar como tu email, nombre u organizacion.";
  }

  return null;
}

const emailSchema = z
  .string()
  .transform(normalizeEmail)
  .pipe(
    z
      .string()
      .min(1, "El email es requerido")
      .max(EMAIL_MAX_LENGTH, `El email no puede superar ${EMAIL_MAX_LENGTH} caracteres`)
      .email("Email invalido")
  );

const passwordLoginSchema = z
  .string()
  .min(1, "La contrasena es requerida")
  .max(PASSWORD_MAX_LENGTH, `La contrasena no puede superar ${PASSWORD_MAX_LENGTH} caracteres`);

const passwordStorageSchema = z
  .string()
  .max(PASSWORD_MAX_LENGTH, `La contrasena no puede superar ${PASSWORD_MAX_LENGTH} caracteres`);

const registerBaseSchema = z.object({
  organizationName: getRequiredTextSchema("nombre de la organizacion", ORGANIZATION_NAME_MAX_LENGTH),
  fullName: getRequiredTextSchema("nombre completo", PERSON_NAME_MAX_LENGTH),
  email: emailSchema,
  password: passwordStorageSchema,
});

export const registerRequestSchema = registerBaseSchema.superRefine((data, ctx) => {
  const passwordError = getPasswordValidationError(data.password, {
    email: data.email,
    fullName: data.fullName,
    organizationName: data.organizationName,
  });

  if (passwordError) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["password"],
      message: passwordError,
    });
  }
});

export const registerFormSchema = registerBaseSchema
  .extend({
    confirmPassword: z.string().min(1, "Confirmar la contrasena es requerido"),
  })
  .superRefine((data, ctx) => {
    const passwordError = getPasswordValidationError(data.password, {
      email: data.email,
      fullName: data.fullName,
      organizationName: data.organizationName,
    });

    if (passwordError) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: passwordError,
      });
    }

    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Las contrasenas no coinciden",
      });
    }
  });

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: passwordLoginSchema,
  authorizeLogin: z
    .boolean()
    .refine((value) => value, { message: "Confirma que quieres iniciar sesion antes de continuar" }),
});

export const resetPasswordRequestSchema = z.object({
  email: emailSchema,
});

export const updatePasswordSchema = z.object({
  password: passwordStorageSchema,
});

export function validateUpdatedPassword(password: string): string | null {
  return getPasswordValidationError(password);
}

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type RegisterFormInput = z.infer<typeof registerFormSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
export type UpdatePasswordRequest = z.infer<typeof updatePasswordSchema>;
