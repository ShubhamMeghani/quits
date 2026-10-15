// Group share tokens (R1): 128 bits from a CSPRNG, base64url (22 chars).

export const TOKEN_RE = /^[A-Za-z0-9_-]{22,64}$/;

export function generateToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

export function isValidToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_RE.test(value);
}
