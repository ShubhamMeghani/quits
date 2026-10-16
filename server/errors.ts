// Typed application errors mapped to HTTP statuses (R51, R55).

export type AppErrorCode =
  | "NOT_FOUND"
  | "VALIDATION"
  | "NAME_TAKEN"
  | "BASE_CURRENCY_LOCKED"
  | "RATE_UNAVAILABLE"
  | "BALANCE_NOT_ZERO"
  | "RATE_LIMITED"
  | "INTERNAL";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = () => new AppError("NOT_FOUND", 404, "Not found");
export const invalid = (message: string, details?: unknown) => new AppError("VALIDATION", 400, message, details);

/** Maps a Postgres / PostgREST error to an AppError without leaking internals (R51). */
export function fromDbError(err: { code?: string; message?: string } | null | undefined, context: string): AppError {
  const msg = err?.message ?? "";
  if (msg.includes("NOT_FOUND") || err?.code === "P0002") return notFound();
  if (msg.includes("BASE_CURRENCY_LOCKED")) {
    return new AppError("BASE_CURRENCY_LOCKED", 409, "The base currency can't change once the group has expenses.");
  }
  if (err?.code === "23505") return new AppError("NAME_TAKEN", 409, "Name already used");
  if (err?.code === "23503") return notFound();
  if (err?.code === "23514" || err?.code === "22P02" || err?.code === "22007") return invalid("Invalid value");
  console.error(`db error in ${context}: ${err?.code ?? "unknown"}`);
  return new AppError("INTERNAL", 500, "Something went wrong. Please try again.");
}
