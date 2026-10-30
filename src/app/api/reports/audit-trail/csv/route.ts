import { NextResponse } from "next/server";
import { requireModule } from "@/lib/guard";
import { getAuditTrail } from "@/lib/reports";

function escapeCsvCell(v: string | null): string {
  const text = v ?? "";
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export async function POST(request: Request) {
  await requireModule("reports", "read");
  try {
    const body = await request.json();
    const filters = {
      fromDate: body.fromDate ? new Date(body.fromDate) : undefined,
      toDate: body.toDate ? new Date(body.toDate) : undefined,
      userEmail: body.userEmail || undefined,
      action: body.action || undefined,
    };
    const rows = await getAuditTrail(filters);
    const BOM = "\uFEFF";
    const headers = ["Date", "User", "Action", "Entity Type", "Entity ID", "Detail"];
    const lines = [headers.join(",")];
    for (const r of rows) {
      lines.push([
        r.createdAt.toISOString().slice(0, 19).replace("T", " "),
        escapeCsvCell(r.userEmail),
        escapeCsvCell(r.action),
        escapeCsvCell(r.entityType),
        escapeCsvCell(r.entityId),
        escapeCsvCell(r.detail),
      ].join(","));
    }
    const csv = BOM + lines.join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit_trail_${new Date().toISOString().slice(0,10)}.csv"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to generate audit CSV";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
