import "server-only";

import { createHash } from "node:crypto";

const PWNED_PASSWORDS_RANGE_URL = "https://api.pwnedpasswords.com/range";
const PWNED_PASSWORDS_TIMEOUT_MS = 5000;
const COMPROMISED_PASSWORD_MESSAGE =
  "La contrasena fue detectada en filtraciones conocidas. Elige una frase unica que no hayas usado antes.";
const BREACH_CHECK_UNAVAILABLE_MESSAGE =
  "No se pudo validar la seguridad de la contrasena en este momento. Intenta nuevamente.";

type PasswordBreachCheckResult =
  | { ok: true; compromised: boolean }
  | { ok: false; message: string };

function sha1(value: string): string {
  return createHash("sha1").update(value, "utf8").digest("hex").toUpperCase();
}

export async function checkPasswordAgainstBreaches(
  password: string
): Promise<PasswordBreachCheckResult> {
  const passwordHash = sha1(password.normalize("NFKC"));
  const prefix = passwordHash.slice(0, 5);
  const suffix = passwordHash.slice(5);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PWNED_PASSWORDS_TIMEOUT_MS);

  try {
    const response = await fetch(`${PWNED_PASSWORDS_RANGE_URL}/${prefix}`, {
      method: "GET",
      headers: {
        "Add-Padding": "true",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error("auth.password_breach_check.http_error", {
        status: response.status,
      });
      return { ok: false, message: BREACH_CHECK_UNAVAILABLE_MESSAGE };
    }

    const body = await response.text();
    const compromised = body
      .split("\n")
      .map((line) => line.trim())
      .some((line) => line.split(":")[0] === suffix);

    return { ok: true, compromised };
  } catch (error) {
    console.error("auth.password_breach_check.failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return { ok: false, message: BREACH_CHECK_UNAVAILABLE_MESSAGE };
  } finally {
    clearTimeout(timeout);
  }
}

export function getCompromisedPasswordMessage(): string {
  return COMPROMISED_PASSWORD_MESSAGE;
}