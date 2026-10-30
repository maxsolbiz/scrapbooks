"use server";

import { requireModule } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import { formatAED } from "@/lib/money";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { prisma } from "@/lib/db";

export default async function ChequeRegisterPage() {
  await requireModule("reports");
  const locale = await getServerLocale();
  const t = getDictionary(locale);

  const payments = await prisma.payment.findMany({
    where: {
      OR: [{ method: "PDC_IN" }, { method: "PDC_OUT" }],
    },
    include: { party: true },
    orderBy: [{ clearanceDate: "asc" }, { date: "asc" }],
  });

  return (
    <div className="space-y-4">
      <PageHeader title={t.payments.chequeNo || "Cheque Register"} />

      <Card>
        <CardContent className="pt-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">{t.payments.chequeNo || "PDC Register"}</h3>
            <Link href="/api/reports/cheque-register/csv" target="_blank">
              <Badge variant="outline" className="cursor-pointer hover:bg-accent">Download CSV</Badge>
            </Link>
          </div>
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Party</th>
                  <th className="text-left px-4 py-3">Cheque #</th>
                  <th className="text-left px-4 py-3">Bank</th>
                  <th className="text-right px-4 py-3">Amount (AED)</th>
                  <th className="text-left px-4 py-3">Clearance</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b hover:bg-muted/20">
                    <td className="px-4 py-3">{p.date.toISOString().slice(0, 10)}</td>
                    <td className="px-4 py-3">{p.party?.nameEn ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs">{p.chequeNo ?? "—"}</td>
                    <td className="px-4 py-3">{p.bankName ?? "—"}</td>
                    <td className="text-right px-4 py-3 font-mono">{formatAED(BigInt(p.amountFils))}</td>
                    <td className="px-4 py-3">{p.clearanceDate ? p.clearanceDate.toISOString().slice(0, 10) : "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={p.pdcStatus === "BUNCED" ? "destructive" : p.pdcStatus === "CLEARED" ? "outline" : "secondary"}>
                        {p.pdcStatus === "PENDING" ? t.payments.pending : p.pdcStatus === "CLEARED" ? t.payments.cleared : t.payments.bounced}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {p.pdcStatus === "PENDING" && (
                        <div className="flex gap-2">
                          <Link href={`/payments/${p.id}/clear`} className="text-xs underline text-blue-600 hover:text-blue-800">Clear</Link>
                          <Link href={`/payments/${p.id}/bounce`} className="text-xs underline text-red-600 hover:text-red-800">Bounce</Link>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
