import { NextResponse } from "next/server";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { applyCreditToInvoice } from "@/lib/payments";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  try {
    await requireUser();
    const body = await request.json();
    const amountFils = BigInt(body.amountFils);

    await prisma.$transaction(async (tx) =>
      applyCreditToInvoice({ tx, invoiceId: id, amountFils })
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Failed to apply credit";
    return NextResponse.json({ ok: false, error: errorMessage }, { status: 400 });
  }
}