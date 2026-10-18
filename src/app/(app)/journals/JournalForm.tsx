"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Dictionary } from "@/lib/i18n";
import type { AccountOption } from "@/lib/accounts";
import { formatAED } from "@/lib/money";
import { createJournal } from "./actions";

interface Line {
  id: string;
  accountId: string;
  debit: string;
  credit: string;
}

function lineToFils(value: string): bigint {
  const trimmed = value.trim();
  if (!trimmed || !/^\d+(\.\d{1,2})?$/.test(trimmed)) return 0n;
  const [whole, part = ""] = trimmed.split(".");
  return BigInt(whole || "0") * 100n + BigInt((part + "0").slice(0, 2));
}

export function JournalForm({
  accounts,
  dict,
  today,
}: {
  accounts: AccountOption[];
  dict: Dictionary;
  today: string;
}) {
  const t = dict;
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([
    { id: "l1", accountId: "", debit: "", credit: "" },
    { id: "l2", accountId: "", debit: "", credit: "" },
  ]);
  const [date, setDate] = useState(today);
  const [narration, setNarration] = useState("");
  const [narrationAr, setNarrationAr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const totals = useMemo(() => {
    let debit = 0n;
    let credit = 0n;
    for (const l of lines) {
      debit += lineToFils(l.debit);
      credit += lineToFils(l.credit);
    }
    return { debit, credit, balanced: debit === credit && debit !== 0n };
  }, [lines]);

  function lineError(l: Line): string | null {
    const debit = lineToFils(l.debit);
    const credit = lineToFils(l.credit);
    if (debit > 0n && credit > 0n) return t.journals.oneSide;
    if (debit === 0n && credit === 0n) return t.journals.zeroLine;
    return null;
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      { id: `l${Date.now()}`, accountId: "", debit: "", credit: "" },
    ]);
  }

  function removeLine(id: string) {
    setLines((prev) => (prev.length > 2 ? prev.filter((l) => l.id !== id) : prev));
  }

  function setLine(id: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  async function submit() {
    if (lines.length < 2) {
      toast.error(t.journals.needTwoLines);
      return;
    }
    if (!totals.balanced) {
      toast.error(t.journals.unbalanced);
      return;
    }
    for (const l of lines) {
      const err = lineError(l);
      if (err) {
        toast.error(err);
        return;
      }
      if (!l.accountId) {
        toast.error(t.common.required);
        return;
      }
    }
    setSubmitting(true);
    const res = await createJournal({
      date,
      narration,
      narrationAr,
      lines: lines.map((l) => ({
        accountId: l.accountId,
        debit: l.debit || "0",
        credit: l.credit || "0",
      })),
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(t.journals.posted);
    router.push("/journals");
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t.journals.new}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="date">{t.common.date}</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="narr">{t.common.description}</Label>
              <Input id="narr" value={narration} onChange={(e) => setNarration(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="narrAr" dir="rtl">
                {t.common.description} (ع)
              </Label>
              <Input
                id="narrAr"
                dir="rtl"
                value={narrationAr}
                onChange={(e) => setNarrationAr(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-start">
                  <th className="w-1/2 px-3 py-2 text-start text-xs font-medium text-muted-foreground">
                    {t.accounts.account}
                  </th>
                  <th className="w-36 px-3 py-2 text-start text-xs font-medium text-muted-foreground">
                    {t.common.debit}
                  </th>
                  <th className="w-36 px-3 py-2 text-start text-xs font-medium text-muted-foreground">
                    {t.common.credit}
                  </th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const err = lineError(l);
                  return (
                    <tr key={l.id} className="border-b last:border-b-0 align-top">
                      <td className="px-3 py-2">
                        <Select
                          value={l.accountId}
                          onValueChange={(v) => setLine(l.id, { accountId: v })}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent className="max-h-72">
                            {accounts.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                <span className="font-mono text-xs">{a.code}</span>
                                {" "}
                                <span>{a.nameEn}</span>
                                <span className="ms-2 text-muted-foreground">{a.nameAr}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {err && <p className="mt-1 text-xs text-destructive">{err}</p>}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={l.debit}
                          onChange={(e) => setLine(l.id, { debit: e.target.value, credit: "" })}
                          dir="ltr"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={l.credit}
                          onChange={(e) => setLine(l.id, { credit: e.target.value, debit: "" })}
                          dir="ltr"
                        />
                      </td>
                      <td className="px-1 py-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeLine(l.id)}
                          disabled={lines.length <= 2}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30">
                  <td className="px-3 py-2 font-medium">{t.common.total}</td>
                  <td className="px-3 py-2 tabular-nums">{formatAED(totals.debit)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatAED(totals.credit)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={addLine}>
              <Plus className="size-4" /> {t.journals.addLine}
            </Button>
            <div className="flex items-center gap-3">
              {!totals.balanced && (totals.debit > 0n || totals.credit > 0n) && (
                <span className="text-sm text-destructive">{t.journals.unbalanced}</span>
              )}
              <Button onClick={submit} disabled={submitting || !totals.balanced}>
                {t.common.post}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
