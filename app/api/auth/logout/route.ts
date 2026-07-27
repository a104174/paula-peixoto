import { NextRequest, NextResponse } from "next/server";
import { hasValidRequestOrigin } from "@/lib/auth/csrf";
import {
  ADMIN_SESSION_COOKIE,
  revokeSessionByToken,
  sessionCookieOptions,
} from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  if (!hasValidRequestOrigin(request)) {
    return NextResponse.json(
      { error: "Pedido inválido." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  await revokeSessionByToken(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  const response = NextResponse.redirect(new URL("/admin/login", request.url), 303);
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set(ADMIN_SESSION_COOKIE, "", {
    ...sessionCookieOptions(new Date(0)),
    maxAge: 0,
  });
  return response;
}
