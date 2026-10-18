"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import { saveParty } from "./actions";

export interface PartyRow {
  id: string;
  code: string;
  type: string;
  nameEn: string;
  nameAr: string;
  trn: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
}

const schema = z.object({
  code: z.string().min(1),
  type: z.enum(["CUSTOMER", "VENDOR", "BOTH"]),
  nameEn: z.string().min(1),
  nameAr: z.string().min(1),
  trn: z.string(),
  phone: z.string(),
  email: z.string(),
  addressEn: z.string(),
  addressAr: z.string(),
});
type FormValues = z.infer<typeof schema>;

export function PartiesClient({
  rows,
  dict,
}: {
  rows: PartyRow[];
  dict: Dictionary;
}) {
  const t = dict;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PartyRow | null>(null);
  const [isActive, setIsActive] = useState(true);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: "",
      type: "CUSTOMER",
      nameEn: "",
      nameAr: "",
      trn: "",
      phone: "",
      email: "",
      addressEn: "",
      addressAr: "",
    },
  });

  function openCreate() {
    setEditing(null);
    setIsActive(true);
    const nextCode = `P-${String(rows.length + 1).padStart(3, "0")}`;
    form.reset({
      code: nextCode,
      type: "CUSTOMER",
      nameEn: "",
      nameAr: "",
      trn: "",
      phone: "",
      email: "",
      addressEn: "",
      addressAr: "",
    });
    setOpen(true);
  }

  function openEdit(p: PartyRow) {
    setEditing(p);
    setIsActive(p.isActive);
    form.reset({
      code: p.code,
      type: p.type as FormValues["type"],
      nameEn: p.nameEn,
      nameAr: p.nameAr,
      trn: p.trn ?? "",
      phone: p.phone ?? "",
      email: p.email ?? "",
      addressEn: "",
      addressAr: "",
    });
    setOpen(true);
  }

  const onSubmit = form.handleSubmit(async (values) => {
    const res = await saveParty({ ...values, isActive: editing ? isActive : undefined });
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t.nav.parties}</h1>
        <Button onClick={openCreate}>
          <Plus className="size-4" /> {t.parties.new}
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.items.unit}</TableHead>
              <TableHead>{t.common.name}</TableHead>
              <TableHead>{t.common.type}</TableHead>
              <TableHead>{t.parties.trn}</TableHead>
              <TableHead className="w-28">{t.common.status}</TableHead>
              <TableHead className="w-20">{t.common.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.code}</TableCell>
                <TableCell>
                  {p.nameEn}
                  <span className="ms-2 text-xs text-muted-foreground" dir="rtl">
                    {p.nameAr}
                  </span>
                </TableCell>
                <TableCell className="text-xs">{p.type}</TableCell>
                <TableCell className="font-mono text-xs">{p.trn ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={p.isActive ? "default" : "secondary"}>
                    {p.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                    <Pencil className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? t.parties.edit : t.parties.new}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t.common.code}</Label>
                <Input {...form.register("code")} disabled={!!editing} />
              </div>
              <div className="space-y-1.5">
                <Label>{t.common.type}</Label>
                <Select
                  value={form.watch("type")}
                  onValueChange={(v) => form.setValue("type", v as FormValues["type"])}
                  disabled={!!editing}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CUSTOMER">CUSTOMER</SelectItem>
                    <SelectItem value="VENDOR">VENDOR</SelectItem>
                    <SelectItem value="BOTH">BOTH</SelectItem>
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
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>{t.parties.trn}</Label>
                <Input {...form.register("trn")} dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label>{t.parties.phone}</Label>
                <Input {...form.register("phone")} dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label>{t.parties.email}</Label>
                <Input type="email" {...form.register("email")} dir="ltr" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t.parties.addressEn}</Label>
                <Textarea rows={2} {...form.register("addressEn")} />
              </div>
              <div className="space-y-1.5">
                <Label dir="rtl">{t.parties.addressAr}</Label>
                <Textarea rows={2} dir="rtl" {...form.register("addressAr")} />
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
