import { NextResponse } from "next/server";
import { requireModule } from "@/lib/guard";
import { calculateAgingBuckets } from "@/lib/aging";

export async function GET() {
  await requireModule("reports");

  try {
    // Default to a demo/customer for aging (filtering by party can be added)
    const buckets = await calculateAgingBuckets("cmvu17yst001qy40gbqno15zr");

    const BOM = "\uFEFF";
    const headers = ["Category", "Days Past Due", "Amount (AED)"];
    const rows = [
      ["Current (0-30 days)", "0-30", (Number(buckets.current) / 100).toFixed(2)],
      ["31-60 Days", "31-60", (Number(buckets.days31to60) / 100).toFixed(2)],
      ["61-90 Days", "61-90", (Number(buckets.days61to90) / 100).toFixed(2)],
      ["90+ Days", "90+", (Number(buckets.over90) / 100).toFixed(2)],
      ["Total Outstanding (Aging)", "—", (Number(buckets.total) / 100).toFixed(2)],
    ];
    const csvContent = BOM + [headers.join(","), ...rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))].join("\n");

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="aging_report.csv"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "Failed to generate aging CSV" }, { status: 500 });
  }
}