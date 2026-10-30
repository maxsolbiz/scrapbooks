import { NextResponse } from "next/server";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { createDeduction } from "@/lib/deduction-actions";
import { z } from "zod";

const schema = z.object({
  reason: z.enum(["SHORTAGE", "DAMAGE", "DISCOUNT", "RETURN", "OTHER"]),
  amountFils: z.coerce.bigint().positive(),
  notes: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const user = await requireUser();
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }

    const deduction = await prisma.$transaction(async (tx) =>
      createDeduction({
        tx,
        invoiceId: id,
        reason: parsed.data.reason,
        amountFils: parsed.data.amountFils,
        notes: parsed.data.notes ?? null,
        createdById: user.id,
      })
    );

    return NextResponse.json({ ok: true, deduction });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Failed to post deduction";
    return NextResponse.json({ ok: false, error: errorMessage }, { status: 400 });
  }
}
