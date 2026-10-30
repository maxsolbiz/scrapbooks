import { NextResponse } from "next/server";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { updateDeduction } from "@/lib/deduction-actions";
import { z } from "zod";

const schema = z.object({
  reason: z.enum(["SHORTAGE", "DAMAGE", "COMMERCIAL_DISCOUNT", "RETURN", "OTHER"]),
  // D1: VAT-exclusive base amount; the server derives VAT from the rate.
  baseAmountFils: z.coerce.bigint().positive(),
  vatRate: z.coerce.number().nonnegative().optional(),
  notes: z.string().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; deductionId: string }> }
) {
  const { id, deductionId } = await params;

  try {
    const user = await requireUser();
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) =>
      updateDeduction({
        tx,
        invoiceId: id,
        deductionId,
        reason: parsed.data.reason,
        baseAmountFils: parsed.data.baseAmountFils,
        vatRate: parsed.data.vatRate ?? null,
        notes: parsed.data.notes ?? null,
        createdById: user.id,
        createdByEmail: user.email,
      })
    );

    const updated = result.deduction;
    if (!updated) {
      return NextResponse.json({ ok: false, error: "Failed to update deduction" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      deduction: {
        id: updated.id,
        invoiceId: updated.invoiceId,
        reason: updated.reason,
        baseAmountFils: updated.baseAmountFils.toString(),
        vatRate: updated.vatRate.toString(),
        vatFils: updated.vatFils.toString(),
        totalFils: updated.totalFils.toString(),
        notes: updated.notes ?? null,
        journalEntryId: updated.journalEntryId ?? null,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Failed to update deduction";
    return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 });
  }
}
