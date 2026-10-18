"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import type { Dictionary } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { saveItem } from "./actions";

export interface ItemRow {
  id: string;
  code: string | null;
  nameEn: string;
  nameAr: string;
  unit: string;
  defaultRate: string | null;
  vatRate: number;
  isActive: boolean;
}

const schema = z.object({
  code: z.string(),
  nameEn: z.string().min(1),
  nameAr: z.string().min(1),
  unit: z.enum(["KG", "TON", "PCS", "BAG", "OTHER"]),
  defaultRate: z.string(),
  vatRate: z.string(),
});
type FormValues = z.infer<typeof schema>;

import { formatAED } from "@/lib/money";

function filsToDisplay(fils: string | null): string {
  if (!fils) return "";
  return formatAED(BigInt(fils));
}

export function ItemsClient({ rows, dict, canWrite }: { rows: ItemRow[]; dict: Dictionary; canWrite: boolean }) {
  const t = dict;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ItemRow | null>(null);
  const [isActive, setIsActive] = useState(true);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { code: "", nameEn: "", nameAr: "", unit: "KG", defaultRate: "", vatRate: "5" },
  });

  function openCreate() {
    setEditing(null);
    setIsActive(true);
    form.reset({ code: "", nameEn: "", nameAr: "", unit: "KG", defaultRate: "", vatRate: "5" });
    setOpen(true);
  }

  function openEdit(it: ItemRow) {
    setEditing(it);
    setIsActive(it.isActive);
    form.reset({
      code: it.code ?? "",
      nameEn: it.nameEn,
      nameAr: it.nameAr,
      unit: it.unit as FormValues["unit"],
      defaultRate: filsToDisplay(it.defaultRate),
      vatRate: String(it.vatRate),
    });
    setOpen(true);
  }

  const onSubmit = form.handleSubmit(async (values) => {
    const res = await saveItem({ ...values, isActive: editing ? isActive : undefined });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Saved");
    setOpen(false);
    router.refresh();
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.nav.items}
        actions={
          canWrite ? (
            <Button onClick={openCreate}>
              <Plus className="size-4" /> {t.items.new}
            </Button>
          ) : undefined
        }
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.common.code}</TableHead>
              <TableHead>{t.common.name}</TableHead>
              <TableHead className="w-20">{t.items.unit}</TableHead>
              <TableHead className="text-end">{t.items.rate}</TableHead>
              <TableHead className="text-end">{t.items.vat}</TableHead>
              <TableHead className="w-28">{t.common.status}</TableHead>
              <TableHead className="w-20">{t.common.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((it) => (
              <TableRow key={it.id}>
                <TableCell className="font-mono text-xs">{it.code ?? "—"}</TableCell>
                <TableCell>
                  {it.nameEn}
                  <span className="ms-2 text-xs text-muted-foreground" dir="rtl">
                    {it.nameAr}
                  </span>
                </TableCell>
                <TableCell className="text-xs">{it.unit}</TableCell>
                <TableCell className="text-end tabular-nums">
                  {it.defaultRate ? filsToDisplay(it.defaultRate) : "—"}
                </TableCell>
                <TableCell className="text-end tabular-nums">
                  {(Number(it.vatRate) * 100).toFixed(0)}%
                </TableCell>
                <TableCell>
                  <Badge variant={it.isActive ? "default" : "secondary"}>
                    {it.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {canWrite ? (
                    <Button variant="ghost" size="sm" onClick={() => openEdit(it)}>
                      <Pencil className="size-4" />
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? t.items.edit : t.items.new}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t.common.code}</Label>
                <Input {...form.register("code")} dir="ltr" placeholder="optional" />
              </div>
              <div className="space-y-1.5">
                <Label>{t.items.unit}</Label>
                <Select
                  value={form.watch("unit")}
                  onValueChange={(v) => form.setValue("unit", v as FormValues["unit"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="KG">KG</SelectItem>
                    <SelectItem value="TON">TON</SelectItem>
                    <SelectItem value="PCS">PCS</SelectItem>
                    <SelectItem value="BAG">BAG</SelectItem>
                    <SelectItem value="OTHER">OTHER</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t.common.nameEn}</Label>
                <Input {...form.register("nameEn")} />
              </div>
              <div className="space-y-1.5">
                <Label dir="rtl">{t.common.nameAr}</Label>
                <Input dir="rtl" {...form.register("nameAr")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t.items.rate}</Label>
                <Input type="number" step="0.01" min="0" {...form.register("defaultRate")} dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label>{t.items.vat}</Label>
                <Input {...form.register("vatRate")} dir="ltr" placeholder="5" />
              </div>
            </div>
            {editing && (
              <div className="flex items-center gap-2">
                <Checkbox id="isActive" checked={isActive} onCheckedChange={(v) => setIsActive(v === true)} />
                <Label htmlFor="isActive">Active</Label>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t.common.cancel}
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {t.common.save}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
