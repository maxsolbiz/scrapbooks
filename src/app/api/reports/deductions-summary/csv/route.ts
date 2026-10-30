import { NextResponse } from "next/server";
import { requireModule } from "@/lib/guard";
import { getDeductionsSummary, type DeductionsSummaryFilter } from "@/lib/reports";
import { formatAED } from "@/lib/money";

function escapeCsvCell(v: string | null | undefined): string {
  const text = v == null ? "" : String(v);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export async function POST(request: Request) {
  await requireModule("reports", "read");
  try {
    const body = await request.json();
    const filters: DeductionsSummaryFilter = {
      fromDate: body.fromDate ? new Date(body.fromDate) : undefined,
      toDate: body.toDate ? new Date(body.toDate) : undefined,
      reason: body.reason || undefined,
      partyId: body.partyId || undefined,
      direction: body.direction || "ALL",
    };
    const rows = await getDeductionsSummary(filters);
    const BOM = "\uFEFF";
    const headers = ["Date", "Invoice No", "Direction", "Party", "Reason", "Base (AED)", "VAT (AED)", "Total (AED)", "Notes"];
    const csvRows = rows.map((r) => [
      r.createdAt.toISOString().slice(0, 19).replace("T", " "),
      escapeCsvCell(r.invoiceNo),
      r.direction,
      escapeCsvCell(r.partyName),
      r.reason,
      formatAED(r.baseAmountFils),
      formatAED(r.vatFils),
      formatAED(r.totalFils),
      escapeCsvCell(r.notes),
    ].join(","));
    const csvContent = BOM + [headers.join(","), ...csvRows].join("\n");
    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="deductions_summary_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to generate deductions CSV";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
