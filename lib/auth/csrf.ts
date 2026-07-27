import { NextRequest } from "next/server";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function hasValidRequestOrigin(request: NextRequest): boolean {
  if (!MUTATING_METHODS.has(request.method.toUpperCase())) return true;

  const expectedOrigin = request.nextUrl.origin;
  const origin = request.headers.get("origin");
  if (origin) return safeOrigin(origin) === expectedOrigin;

  const referer = request.headers.get("referer");
  return Boolean(referer && safeOrigin(referer) === expectedOrigin);
}

function safeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}
