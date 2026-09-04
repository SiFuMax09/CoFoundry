import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getMaskedApiKey, setApiKey, deleteApiKey, getDecryptedApiKey } from "@/lib/api-keys";
import { testApiKey } from "@/lib/ai/openrouter";

export async function GET() {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  const masked = getMaskedApiKey(auth.user.id);
  return NextResponse.json({ hasKey: Boolean(masked), maskedKey: masked });
}

const bodySchema = z.object({ apiKey: z.string().trim().min(10).max(500) });

export async function PUT(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Bitte einen gültigen OpenRouter-Key eingeben." }, { status: 400 });
  }

  const shouldTest = new URL(request.url).searchParams.get("test") === "1";
  if (shouldTest) {
    const result = await testApiKey(parsed.data.apiKey);
    if (!result.ok) {
      return NextResponse.json(
        { error: `Key konnte nicht verifiziert werden: ${result.error ?? "unbekannter Fehler"}` },
        { status: 400 }
      );
    }
  }

  setApiKey(auth.user.id, parsed.data.apiKey);
  return NextResponse.json({ maskedKey: getMaskedApiKey(auth.user.id) });
}

export async function DELETE() {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  deleteApiKey(auth.user.id);
  return NextResponse.json({ ok: true });
}

// Test-Endpunkt für den bereits gespeicherten Key (kein neuer Key im Body nötig).
export async function POST() {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  const key = getDecryptedApiKey(auth.user.id);
  if (!key) return NextResponse.json({ error: "Kein Key hinterlegt." }, { status: 400 });

  const result = await testApiKey(key);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Test fehlgeschlagen." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
