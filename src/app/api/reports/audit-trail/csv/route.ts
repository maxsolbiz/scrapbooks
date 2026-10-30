import { NextResponse } from "next/server";
import { getAuditAccess } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { getAuditTrail, parseAuditTrailParams, formatDubaiDateTime, formatDubaiDate } from "@/lib/reports";

// Hard cap on exported rows so a malicious or accidental filter can't
// materialize a huge response. Over the cap we refuse rather than silently
// truncate, so an auditor never assumes a CSV is complete when it is not.
const EXPORT_ROW_CAP = 50000;

// Characters that make Excel/LibreOffice interpret a cell as a formula.
// Cells starting with any of these are prefixed with a single quote so they
// open as literal text instead of executing.
const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

function escapeCsvCell(v: string | null): string {
  const text = v ?? "";
  if (FORMULA_PREFIXES.some((p) => text.startsWith(p))) {
    return `'${text}`;
  }
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

    if (total > EXPORT_ROW_CAP) {
      return NextResponse.json(
        {
          ok: false,
          error: `Too many rows (${total}). Narrow the date range or filters and retry.`,
        },
        { status: 413 },
      );
    }

    const BOM = "\uFEFF";
    const headers = ["Date", "User", "Action", "Entity Type", "Entity ID", "Detail"];
    const lines = [headers.join(",")];
    for (const r of rows) {
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

    // The export itself is an auditable action. Record who exported, what
    // filters were applied, and how many rows were included.
    const filterSummary = [
      parsed.fromDate ? `from=${formatDubaiDate(parsed.fromDate)}` : null,
      parsed.toDate ? `to=${formatDubaiDate(parsed.toDate)}` : null,
      parsed.userEmail ? `user=${parsed.userEmail}` : null,
      parsed.action ? `action=${parsed.action}` : null,
    ]
      .filter(Boolean)
      .join(" ");
    await prisma.auditLog.create({
      data: {
        userId: user.id ?? null,
        userEmail: user.email ?? "",
        action: "AUDIT_EXPORTED",
        entityType: "AuditLog",
        entityId: null,
        detail: `Exported ${rows.length} audit rows. Filters: ${filterSummary || "(none)"}`,
      },
    });

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit_trail_${formatDubaiDate(new Date())}.csv"`,
      },
    });
  } catch (e) {
    console.error("audit CSV export failed", e instanceof Error ? e : new Error(String(e)));
    return NextResponse.json({ ok: false, error: "Failed to generate audit CSV" }, { status: 500 });
  }
}
