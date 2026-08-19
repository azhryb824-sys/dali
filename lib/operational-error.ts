export class OperationalError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "OperationalError";
    this.code = code;
  }
}

export function safeOperationalErrorCode(error: unknown, fallback = "UNKNOWN") {
  const candidates: string[] = [];
  if (typeof error === "object" && error) {
    if ("code" in error) candidates.push(String(error.code));
    if (error instanceof Error) candidates.push(error.message);
  }
  for (const candidate of candidates) {
    if (/^[A-Z0-9_:-]{1,80}$/.test(candidate)) return candidate;
  }
  return fallback;
}
