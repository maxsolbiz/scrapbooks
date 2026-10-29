import { prisma } from "@/lib/db";
import { requireModule } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import { partyStatement } from "@/lib/party-statement";
import { formatAED } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { format } from "date-fns";

export default async function StatementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("reports");
  const locale = await getServerLocale();
  const t = getDictionary(locale);
  const { id } = await params;

  const statement = await partyStatement(id);

  return (
    <div className="space-y-4">
      <PageHeader title={t.invoices.statementTitle} className="mb-0" actions={
        <a href={`/api/parties/${id}/statement/pdf`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium h-10 px-4 py-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50">
          {t.invoices.downloadPDF}
        </a>
      } />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">{t.invoices.statementTotalInvoiced}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatAED(statement.summary.totalInvoiced)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">{t.invoices.statementTotalPaid}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatAED(statement.summary.totalPaid)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">{t.invoices.statementOutstanding}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{formatAED(statement.summary.outstanding)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">{t.invoices.statementAvailableCredit}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatAED(statement.summary.availableCredit)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.invoices.statementAging}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="text-sm text-muted-foreground">{t.invoices.agingCurrent}</div>
              <div className="text-2xl font-bold">{formatAED(statement.aging.current)}</div>
            </div>
            <div className="p-4 bg-yellow-50 rounded-lg">
              <div className="text-sm text-muted-foreground">{t.invoices.aging31to60}</div>
              <div className="text-2xl font-bold">{formatAED(statement.aging.days31to60)}</div>
            </div>
            <div className="p-4 bg-orange-50 rounded-lg">
              <div className="text-sm text-muted-foreground">{t.invoices.aging61to90}</div>
              <div className="text-2xl font-bold">{formatAED(statement.aging.days61to90)}</div>
            </div>
            <div className="p-4 bg-red-50 rounded-lg">
              <div className="text-sm text-muted-foreground">{t.invoices.agingOver90}</div>
              <div className="text-2xl font-bold text-destructive">{formatAED(statement.aging.over90)}</div>
            </div>
          </div>
          <div className="text-right text-lg font-semibold">
            {t.invoices.aging}: {formatAED(statement.aging.total)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.invoices.statementTransactions}</CardTitle>
        </CardHeader>
        <CardContent>
          {statement.transactions.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No transactions
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">{t.common.date}</th>
                    <th className="text-left py-2">{t.invoices.statementTransactions}</th>
                    <th className="text-left py-2">{t.payments.reference}</th>
                    <th className="text-right py-2">{t.invoices.statementTotalInvoiced}</th>
                    <th className="text-right py-2">{t.invoices.statementTotalPaid}</th>
                    <th className="text-right py-2">{t.invoices.statementOutstanding}</th>
                    <th className="text-left py-2">{t.common.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.transactions.map((tx, i) => (
                    <tr key={i} className="border-b">
                      <td className="py-2">{format(tx.date, "yyyy-MM-dd")}</td>
                      <td className="py-2 capitalize">{tx.type}</td>
                      <td className="py-2 font-mono text-xs">{tx.documentNo}</td>
                      <td className="text-right py-2">
                        {tx.type === "invoice" ? formatAED(tx.amount) : "—"}
                      </td>
                      <td className="text-right py-2">
                        {tx.type === "payment" ? formatAED(tx.amount) : "—"}
                      </td>
                      <td className="text-right py-2">
                        {tx.outstanding > 0n ? formatAED(tx.outstanding) : "—"}
                      </td>
                      <td className="py-2 capitalize">{tx.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}