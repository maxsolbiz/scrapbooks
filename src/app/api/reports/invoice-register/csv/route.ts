import { NextResponse } from "next/server";
import { requireModule } from "@/lib/guard";
import { getInvoiceRegister, invoiceRegisterToCsv, type InvoiceRegisterFilter } from "@/lib/reports";

export async function POST(request: Request) {
  await requireModule("reports");

  try {
    const body = await request.json();
    const filters: InvoiceRegisterFilter = {
      fromDate: body.fromDate ? new Date(body.fromDate) : undefined,
      toDate: body.toDate ? new Date(body.toDate) : undefined,
      partyId: body.partyId || undefined,
      direction: body.direction || "ALL",
      status: body.status || "ALL",
    };

    const rows = await getInvoiceRegister(filters);
    const csvContent = invoiceRegisterToCsv(rows);

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="invoice_register_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "Failed to generate invoice register CSV" }, { status: 500 });
  }
}
