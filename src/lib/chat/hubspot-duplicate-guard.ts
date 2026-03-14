export function shouldAllowDuplicateHubSpotContact(content: string): boolean {
  return /\b(duplicado|duplicada|duplicate|duplicar|duplica)\b/i.test(content);
}
