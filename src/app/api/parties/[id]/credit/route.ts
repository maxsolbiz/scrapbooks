import { NextResponse } from "next/server";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { partyCreditBalance } from "@/lib/party-credit";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  try {
    await requireUser();
    const creditFils = await partyCreditBalance(id);
    return NextResponse.json({ ok: true, creditFils: creditFils.toString() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Failed to fetch credit" }, { status: 500 });
  }
}