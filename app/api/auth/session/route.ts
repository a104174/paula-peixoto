import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/current-admin";

export async function GET(request: NextRequest) {
  const auth = await requireAdminApi(request, { allowPasswordChange: true });
  if (!auth.ok) return auth.response;
  return NextResponse.json(
    { admin: auth.admin },
    { headers: { "Cache-Control": "no-store, private" } },
  );
}
