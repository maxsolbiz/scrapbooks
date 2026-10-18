"use client";

import { useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import {
  saveCompanyAction,
  saveUserAction,
  type SettingsActionResult,
} from "@/app/(app)/settings/actions";

export interface CompanySettingsDto {
  nameEn: string;
  nameAr: string;
  trn: string;
  addressEn: string;
  addressAr: string;
  phone: string;
  email: string;
  bankDetailsEn: string;
  bankDetailsAr: string;
}

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

function show(res: SettingsActionResult, success: string) {
  if (res.ok) {
    toast.success(success);
  } else {
    toast.error(res.error);
  }
}

export function SettingsClient({
  company,
  users,
  isAdmin,
}: {
  company: CompanySettingsDto;
  users: UserDto[];
  isAdmin: boolean;
}) {
  const [c, setC] = useState<CompanySettingsDto>(company);
  const [saving, setSaving] = useState(false);

  async function saveCompany() {
    setSaving(true);
    const res = await saveCompanyAction(c);
    setSaving(false);
    show(res, "Saved");
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Company / الشركة</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name (EN)"><Input value={c.nameEn} onChange={(e) => setC({ ...c, nameEn: e.target.value })} /></Field>
            <Field label="Name (AR)"><Input dir="rtl" value={c.nameAr} onChange={(e) => setC({ ...c, nameAr: e.target.value })} /></Field>
            <Field label="TRN"><Input value={c.trn} onChange={(e) => setC({ ...c, trn: e.target.value })} /></Field>
            <Field label="Phone"><Input dir="ltr" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} /></Field>
            <Field label="Email"><Input dir="ltr" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} /></Field>
          </div>
          <Field label="Address (EN)"><Input value={c.addressEn} onChange={(e) => setC({ ...c, addressEn: e.target.value })} /></Field>
          <Field label="Address (AR)"><Input dir="rtl" value={c.addressAr} onChange={(e) => setC({ ...c, addressAr: e.target.value })} /></Field>
          <Field label="Bank details (EN)"><Input value={c.bankDetailsEn} onChange={(e) => setC({ ...c, bankDetailsEn: e.target.value })} /></Field>
          <Field label="Bank details (AR)"><Input dir="rtl" value={c.bankDetailsAr} onChange={(e) => setC({ ...c, bankDetailsAr: e.target.value })} /></Field>
          <div className="flex justify-end">
            <Button onClick={saveCompany} disabled={saving}>Save</Button>
          </div>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Users</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {users.map((u) => (
              <UserRow key={u.id} user={u} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function UserRow({ user }: { user: UserDto }) {
  const [role, setRole] = useState(user.role as "ADMIN" | "ACCOUNTANT" | "VIEWER");
  const [isActive, setActive] = useState(user.isActive);
  const [pwd, setPwd] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <div className="grid items-center gap-2 rounded-md border p-3 sm:grid-cols-[1fr_auto_auto_auto]">
      <div>
        <p className="text-sm font-medium">{user.name}</p>
        <p className="text-xs text-muted-foreground">{user.email}</p>
      </div>
      <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="ADMIN">ADMIN</SelectItem>
          <SelectItem value="ACCOUNTANT">ACCOUNTANT</SelectItem>
          <SelectItem value="VIEWER">VIEWER</SelectItem>
        </SelectContent>
      </Select>
      <Switch checked={isActive} onCheckedChange={setActive} />
      <div className="flex gap-2">
        <Input
          placeholder="new password"
          type="password"
          className="w-40"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
        />
        <Button
          size="sm"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            const res = await saveUserAction({ id: user.id, role, isActive, newPassword: pwd || undefined });
            setSaving(false);
            setPwd("");
            show(res, "Saved");
          }}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
