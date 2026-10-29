import { NextResponse } from "next/server";
import { requireUser } from "@/lib/guard";
import { partyStatement } from "@/lib/party-statement";
import { renderToBuffer } from "@react-pdf/renderer";
import { StatementPDF } from "@/components/statements/StatementPDF";
import React from "react";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireUser();
  const { id } = await params;

  try {
    const statement = await partyStatement(id);
    const StatementComponent = StatementPDF as React.ComponentType<any>;
    const pdfBuffer = await renderToBuffer(
      React.createElement(StatementComponent, { statement })
    );

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="statement_${statement.party.code}.pdf"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}