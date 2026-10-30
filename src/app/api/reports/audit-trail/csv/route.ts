import { NextResponse } from "next/server";
import { getAuditAccess } from "@/lib/guard";
import { getAuditTrail, parseAuditTrailParams, formatDubaiDateTime, formatDubaiDate } from "@/lib/reports";

// Hard cap on exported rows so a malicious or accidental filter can't
// materialize a huge response.
const EXPORT_ROW_CAP = 50000;

function escapeCsvCell(v: string | null): string {
  const text = v ?? "";
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export async function POST(request: Request) {
  const user = await getAuditAccess();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  try {
    const body = (await request.json()) as Record<string, string | undefined>;
    const parsed = parseAuditTrailParams(body);
    const { rows, total } = await getAuditTrail({ ...parsed, page: 1, pageSize: EXPORT_ROW_CAP });
    const truncated = total > EXPORT_ROW_CAP;
    const exportRows = truncated ? rows.slice(0, EXPORT_ROW_CAP) : rows;
    const BOM = "\uFEFF";
    const headers = ["Date", "User", "Action", "Entity Type", "Entity ID", "Detail"];
    const lines = [headers.join(",")];
    for (const r of exportRows) {
      lines.push([
        formatDubaiDateTime(r.createdAt),
        escapeCsvCell(r.userEmail),
        escapeCsvCell(r.action),
        escapeCsvCell(r.entityType ?? ""),
        escapeCsvCell(r.entityId ?? ""),
        escapeCsvCell(r.detail ?? ""),
      ].join(","));
    }
    const csv = BOM + lines.join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit_trail_${formatDubaiDate(new Date())}.csv"`,
        "X-Export-Truncated": String(truncated),
      },
    });
  } catch (e) {
    console.error("audit CSV export failed", e instanceof Error ? e : new Error(String(e)));
    return NextResponse.json({ ok: false, error: "Failed to generate audit CSV" }, { status: 500 });
  }
}
