import { NextResponse } from "next/server";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { applyCreditToInvoice } from "@/lib/payments";
import { z } from "zod";

const schema = z.object({
  amountFils: z.coerce.bigint().positive(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  try {
    await requireUser();
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) =>
      applyCreditToInvoice({ tx, invoiceId: id, amountFils: parsed.data.amountFils })
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Failed to apply credit";
    return NextResponse.json({ ok: false, error: errorMessage }, { status: 400 });
  }
}