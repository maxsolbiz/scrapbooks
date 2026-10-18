"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
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
import { Badge } from "@/components/ui/badge";
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
import type { Dictionary } from "@/lib/i18n";
import type { FlatAccount } from "@/lib/accounts";
import { saveAccount } from "./actions";

const schema = z.object({
  code: z.string().regex(/^\d{4}$/, "4 digits"),
  nameEn: z.string().min(1),
  nameAr: z.string().min(1),
  type: z.enum(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]),
  parentId: z.string(),
  isActive: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

const TYPE_LABEL: Record<FormValues["type"], string> = {
  ASSET: "ASSET",
  LIABILITY: "LIABILITY",
  EQUITY: "EQUITY",
  INCOME: "INCOME",
  EXPENSE: "EXPENSE",
};

export function CoaClient({ tree, dict }: { tree: FlatAccount[]; dict: Dictionary }) {
  const router = useRouter();
  const t = dict;
  const groups = tree.filter((a) => a.isGroup);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FlatAccount | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: "",
      nameEn: "",
      nameAr: "",
      type: "ASSET",
      parentId: "",
      isActive: true,
    },
  });

  function openCreate(parent?: FlatAccount) {
    setEditing(null);
    form.reset({
      code: "",
      nameEn: "",
      nameAr: "",
      type: parent?.type as FormValues["type"] ?? "ASSET",
      parentId: parent?.id ?? "",
      isActive: true,
    });
    setOpen(true);
  }

  function openEdit(a: FlatAccount) {
    setEditing(a);
    form.reset({
      code: a.code,
      nameEn: a.nameEn,
      nameAr: a.nameAr,
      type: a.type as FormValues["type"],
      parentId: a.parentId ?? "",
      isActive: a.isActive,
    });
    setOpen(true);
  }

  const onSubmit = form.handleSubmit(async (values) => {
    const res = await saveAccount(values);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(t.journals.posted);
    setOpen(false);
    router.refresh();
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.nav.accounts}
        actions={
          <Button onClick={() => openCreate()}>
            <Plus className="size-4" /> {t.accounts.new}
          </Button>
        }
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">{t.common.code}</TableHead>
              <TableHead>{t.common.name}</TableHead>
              <TableHead className="w-28">{t.accounts.type}</TableHead>
              <TableHead className="w-24">{t.common.status}</TableHead>
              <TableHead className="w-20">{t.common.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tree.map((a) => (
              <TableRow key={a.id} className={a.isGroup ? "bg-muted/50 font-medium" : ""}>
                <TableCell className="font-mono text-xs">
                  {"\u00A0".repeat(a.depth * 4)}
                  {a.code}
                </TableCell>
                <TableCell>
                  {a.nameEn}
                  {a.nameAr && <span className="ms-2 text-xs text-muted-foreground">{a.nameAr}</span>}
                  {a.isGroup && (
                    <Badge variant="outline" className="ms-2">
                      {t.accounts.group}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs">{TYPE_LABEL[a.type as FormValues["type"]]}</TableCell>
                <TableCell>
                  <Badge variant={a.isActive ? "default" : "secondary"}>
                    {a.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(a)}>
                    <Pencil className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? t.accounts.edit : t.accounts.new}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="code">{t.common.code}</Label>
                <Input id="code" placeholder="1110" maxLength={4} {...form.register("code")} />
                {form.formState.errors.code && (
                  <p className="text-xs text-destructive">4 digits</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>{t.accounts.type}</Label>
                <Select
                  value={form.watch("type")}
                  onValueChange={(v) => form.setValue("type", v as FormValues["type"])}
                  disabled={!!editing}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TYPE_LABEL) as FormValues["type"][]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {TYPE_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nameEn">{t.common.nameEn}</Label>
              <Input id="nameEn" {...form.register("nameEn")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nameAr">{t.common.nameAr}</Label>
              <Input id="nameAr" dir="rtl" {...form.register("nameAr")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t.accounts.parent}</Label>
              <Select
                value={form.watch("parentId")}
                onValueChange={(v) => form.setValue("parentId", v === "none" ? "" : v)}
                disabled={!!editing}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.code} {g.nameEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="isActive"
                checked={form.watch("isActive")}
                onCheckedChange={(v) => form.setValue("isActive", v === true)}
              />
              <Label htmlFor="isActive">Active</Label>
            </div>
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
