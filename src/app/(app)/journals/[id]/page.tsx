import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { moduleCan, requireModule, type SessionUser } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import { formatAED } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VoidJournalButton } from "./VoidJournalButton";

export default async function JournalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user: SessionUser = await requireModule("journals");
  const { id } = await params;
  const locale = await getServerLocale();
  const t = getDictionary(locale);

  const entry = await prisma.journalEntry.findUnique({
    where: { id },
    include: {
      lines: {
        include: {
          account: { select: { code: true, nameEn: true, nameAr: true } },
          party: { select: { code: true, nameEn: true, nameAr: true } },
        },
        orderBy: { debit: "desc" },
      },
      reversedBy: { select: { id: true, entryNo: true } },
    },
  });
  if (!entry) notFound();

  const original = entry.reversesEntryId
    ? await prisma.journalEntry.findUnique({
        where: { id: entry.reversesEntryId },
        select: { entryNo: true },
      })
    : null;

  const totalDebit = entry.lines.reduce((acc, l) => acc + l.debit, 0n);
  const totalCredit = entry.lines.reduce((acc, l) => acc + l.credit, 0n);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-mono text-xl">
            {entry.entryNo}
          </h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{entry.date.toISOString().slice(0, 10)}</span>
            <Badge variant={entry.status === "POSTED" ? "default" : entry.status === "DRAFT" ? "secondary" : "outline"}>
              {entry.status}
            </Badge>
            <span className="text-xs">{entry.sourceType}</span>
            {entry.reversedBy && (
              <span className="text-xs">
                Reversed by{" "}
                <Link href={`/journals/${entry.reversedBy.id}`} className="hover:underline">
                  {entry.reversedBy.entryNo}
                </Link>
              </span>
            )}
            {original && (
              <span className="text-xs">Reversal of {original.entryNo}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/journals">{t.common.back}</Link>
          </Button>
          {(await moduleCan(user, "journals", "write")) &&
            entry.sourceType === "MANUAL" &&
            entry.status === "POSTED" && (
              <VoidJournalButton
                entryId={entry.id}
                label={t.journals.voidEntry}
                confirmText={t.journals.voidConfirm}
                cancelLabel={t.common.cancel}
                reasonLabel={t.journals.voidReason}
                reasonPlaceholder={t.journals.voidReasonPlaceholder}
              />
            )}
        </div>
      </div>

      {(entry.narration || entry.narrationAr) && (
        <div className="rounded-md border bg-muted/30 px-4 py-2 text-sm">
          {entry.narration && <div>{entry.narration}</div>}
          {entry.narrationAr && <div dir="rtl" className="text-muted-foreground">{entry.narrationAr}</div>}
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.common.code}</TableHead>
              <TableHead>{t.common.name}</TableHead>
              <TableHead className="hidden sm:table-cell">Party</TableHead>
              <TableHead className="text-end">{t.common.debit}</TableHead>
              <TableHead className="text-end">{t.common.credit}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entry.lines.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-mono text-xs">{l.account.code}</TableCell>
                <TableCell>
                  {l.account.nameEn}
                  <span className="ms-2 text-xs text-muted-foreground" dir="rtl">
                    {l.account.nameAr}
                  </span>
                </TableCell>
                <TableCell className="hidden text-xs sm:table-cell">
                  {l.party ? `${l.party.nameEn} (${l.party.code})` : "—"}
                </TableCell>
                <TableCell className="text-end tabular-nums">
                  {l.debit > 0n ? formatAED(l.debit) : "—"}
                </TableCell>
                <TableCell className="text-end tabular-nums">
                  {l.credit > 0n ? formatAED(l.credit) : "—"}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/30 font-medium">
              <TableCell colSpan={3}>{t.common.total}</TableCell>
              <TableCell className="text-end tabular-nums">{formatAED(totalDebit)}</TableCell>
              <TableCell className="text-end tabular-nums">{formatAED(totalCredit)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
