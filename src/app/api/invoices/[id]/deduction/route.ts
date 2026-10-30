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

    const result = await prisma.$transaction(async (tx) =>
      createDeduction({
        tx,
        invoiceId: id,
        reason: parsed.data.reason,
        amountFils: parsed.data.amountFils,
        notes: parsed.data.notes ?? null,
        createdById: user.id,
      })
    );

    const created = result.deduction;
    if (!created) {
      return NextResponse.json({ ok: false, error: "Failed to post deduction" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      deduction: {
        id: created.id,
        invoiceId: created.invoiceId,
        reason: created.reason,
        amountFils: created.amountFils.toString(),
        notes: created.notes ?? null,
        journalEntryId: created.journalEntryId ?? null,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      },
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Failed to post deduction";
    return NextResponse.json({ ok: false, error: errorMessage }, { status: 400 });
  }
}
