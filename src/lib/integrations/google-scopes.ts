export const GOOGLE_IDENTITY_SCOPES = [
  "openid",
  "email",
  "profile",
] as const;

export const GMAIL_REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/gmail.metadata",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.modify",
] as const;

export const GOOGLE_CALENDAR_REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
] as const;

export const GOOGLE_SURFACES = ["gmail", "google_calendar"] as const;

export type GoogleSurface = (typeof GOOGLE_SURFACES)[number];

export function getRequiredGoogleScopesForSurface(
  surface: GoogleSurface
): string[] {
  if (surface === "gmail") {
    return [...GMAIL_REQUIRED_SCOPES];
  }

  return [...GOOGLE_CALENDAR_REQUIRED_SCOPES];
}

export function getBaseGoogleScopes(): string[] {
  return [...GOOGLE_IDENTITY_SCOPES];
}

export function getDesiredGoogleScopes(
  input: {
    currentGrantedScopes?: string[] | null;
    requestedSurface: GoogleSurface;
  }
): string[] {
  const mergedScopes = new Set<string>([
    ...getBaseGoogleScopes(),
    ...(input.currentGrantedScopes ?? []),
    ...getRequiredGoogleScopesForSurface(input.requestedSurface),
  ]);

  return [...mergedScopes].sort();
}

export function hasAllGoogleScopesForSurface(
  grantedScopes: string[],
  surface: GoogleSurface
): boolean {
  const grantedScopeSet = new Set(grantedScopes);

  return getRequiredGoogleScopesForSurface(surface).every((scope) =>
    grantedScopeSet.has(scope)
  );
}

export function getMissingGoogleScopesForSurface(
  grantedScopes: string[],
  surface: GoogleSurface
): string[] {
  const grantedScopeSet = new Set(grantedScopes);

  return getRequiredGoogleScopesForSurface(surface).filter(
    (scope) => !grantedScopeSet.has(scope)
  );
}

export function normalizeGoogleScopes(scopes: string[]): string[] {
  return [...new Set(scopes.map((scope) => scope.trim()).filter(Boolean))].sort();
}
