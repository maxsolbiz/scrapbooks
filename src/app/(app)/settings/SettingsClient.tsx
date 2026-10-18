"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Plus, Trash2, UserPlus } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { Dictionary } from "@/lib/i18n";
import {
  MODULE_KEYS,
  MODULE_LABEL_KEY,
  MODULE_LEVELS,
  parseOverrides,
  roleDefaults,
  type ModuleAccess,
  type ModuleKey,
} from "@/lib/permissions";
import {
  saveCompanyAction,
  saveUserAction,
  createUserAction,
  deleteUserAction,
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
  permissions: unknown;
}

function show(res: SettingsActionResult, success: string) {
  if (res.ok) {
    toast.success(success);
  } else {
    toast.error(res.error);
  }
}

type RoleValue = "ADMIN" | "ACCOUNTANT" | "VIEWER" | "SUPER_ADMIN";
type PermsMap = Record<ModuleKey, ModuleAccess>;

const ALL_ROLE_OPTIONS: RoleValue[] = ["ADMIN", "ACCOUNTANT", "VIEWER", "SUPER_ADMIN"];

/** Role defaults may say "write" for read-only modules (e.g. reports); display the closest offered level. */
function clampPerms(map: PermsMap): PermsMap {
  const out = { ...map };
  for (const key of MODULE_KEYS) {
    if (!MODULE_LEVELS[key].includes(out[key])) out[key] = "read";
  }
  return out;
}

export function SettingsClient({
  company,
  users,
  isAdmin,
  isSuperAdmin,
  dict,
}: {
  company: CompanySettingsDto;
  users: UserDto[];
  isAdmin: boolean;
  isSuperAdmin: boolean;
  dict: Dictionary;
}) {
  const [c, setC] = useState<CompanySettingsDto>(company);
  const [saving, setSaving] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);

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
            <CardTitle className="text-base flex items-center justify-between gap-2">
              {dict.nav.users}
              <Button size="sm" variant="outline" onClick={() => setShowAddUser((s) => !s)}>
                <UserPlus className="size-4" />
                {dict.usersMgmt.addUser}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {showAddUser && (
              <AddUserForm
                isSuperAdmin={isSuperAdmin}
                dict={dict}
                onDone={(ok) => ok && setShowAddUser(false)}
              />
            )}
            {users.map((u) => (
              <UserRow key={u.id} user={u} isSuperAdmin={isSuperAdmin} dict={dict} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function UserRow({ user, isSuperAdmin, dict }: { user: UserDto; isSuperAdmin: boolean; dict: Dictionary }) {
  const [role, setRole] = useState<RoleValue>(user.role as RoleValue);
  const [isActive, setActive] = useState(user.isActive);
  const [pwd, setPwd] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPerms, setShowPerms] = useState(false);

  const roleOptions = ALL_ROLE_OPTIONS.filter((v) => v !== "SUPER_ADMIN" || isSuperAdmin);

  const defaults = roleDefaults(role);
  const [perms, setPerms] = useState<PermsMap>(() => clampPerms({
    ...defaults,
    ...parseOverrides(user.permissions),
  }));

  function applyRole(next: RoleValue) {
    setRole(next);
    setPerms(clampPerms(roleDefaults(next)));
  }

  function resetPerms() {
    setPerms(clampPerms(roleDefaults(role)));
  }

  async function save() {
    setSaving(true);
    const defaults2 = clampPerms(roleDefaults(role));
    const overrides: Record<string, ModuleAccess> = {};
    for (const key of MODULE_KEYS) {
      if (perms[key] !== defaults2[key]) overrides[key] = perms[key];
    }
    const res = await saveUserAction({
      id: user.id,
      role,
      isActive,
      newPassword: pwd || undefined,
      permissions: Object.keys(overrides).length > 0 ? overrides : null,
    });
    setSaving(false);
    setPwd("");
    show(res, "Saved");
  }

  const roster = MODULE_KEYS.map((key) => ({ key, label: dict.nav[MODULE_LABEL_KEY[key]] }));

  return (
    <div className="rounded-md border">
      <div className={cn(
        "grid items-center gap-2 p-3 sm:grid-cols-[1fr_auto_auto_auto]",
        isSuperAdmin && "sm:grid-cols-[1fr_auto_auto_auto_auto]",
      )}>
        <div className="min-w-0">
          <p className="text-sm font-medium">{user.name}</p>
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
        </div>
        <Select value={role} onValueChange={(v) => applyRole(v as RoleValue)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {roleOptions.map((v) => (
              <SelectItem key={v} value={v}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Switch checked={isActive} onCheckedChange={setActive} />
        <Button variant="ghost" size="sm" className="w-full justify-between sm:w-36" onClick={() => setShowPerms((s) => !s)}>
          {dict.perms.title}
          <ChevronDown className={cn("size-4 transition-transform", showPerms && "rotate-180")} />
        </Button>
        {isSuperAdmin && (
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" aria-label={dict.usersMgmt.delete}>
                <Trash2 className="size-4" />
              </Button>
            }
            title={dict.usersMgmt.deleteTitle}
            description={`${user.name} (${user.email}) — ${dict.usersMgmt.deleteDesc}`}
            confirmLabel={dict.usersMgmt.delete}
            onConfirm={async () => {
              const res = await deleteUserAction({ id: user.id });
              show(res, "Deleted");
              return res;
            }}
          />
        )}
      </div>

      {showPerms && (
        <div className="border-t p-3">
          <div className="grid gap-2">
            {roster.map(({ key, label }) => (
              <div key={key} className="grid items-center gap-2 sm:grid-cols-[1fr_auto]">
                <span className="text-sm">{label}</span>
                <Select
                  value={perms[key]}
                  onValueChange={(v) => setPerms({ ...perms, [key]: v as ModuleAccess })}
                >
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODULE_LEVELS[key].map((lv) => (
                      <SelectItem key={lv} value={lv}>{dict.perms[lv]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <p className="text-xs text-muted-foreground">{dict.perms.hint}</p>
              <Button variant="outline" size="sm" onClick={resetPerms}>
                {dict.perms.reset}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t p-3">
        <Input
          placeholder="new password"
          type="password"
          className="w-44"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
        />
        <Button size="sm" disabled={saving} onClick={save}>
          Save
        </Button>
      </div>
    </div>
  );
}

function AddUserForm({
  isSuperAdmin,
  dict,
  onDone,
}: {
  isSuperAdmin: boolean;
  dict: Dictionary;
  onDone: (ok: boolean) => void;
}) {
  const um = dict.usersMgmt;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [role, setRole] = useState<RoleValue>("ACCOUNTANT");
  const [isActive, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name || !email || pwd.length < 8) {
      toast.error("Name, email and a password (min 8 chars) are required");
      return;
    }
    setSaving(true);
    const res = await createUserAction({ name, email, password: pwd, role, isActive });
    setSaving(false);
    if (res.ok) {
      toast.success("User created");
      setName("");
      setEmail("");
      setPwd("");
      onDone(true);
    } else {
      toast.error(res.error);
    }
  }

  const roleOptions = ALL_ROLE_OPTIONS.filter((v) => v !== "SUPER_ADMIN" || isSuperAdmin);

  return (
    <div className="rounded-md border p-3 grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={um.name}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={um.email}><Input dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label={um.password}>
          <Input dir="ltr" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder={um.passwordHint} />
        </Field>
        <Field label={um.role}>
          <Select value={role} onValueChange={(v) => setRole(v as RoleValue)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {roleOptions.map((v) => (
                <SelectItem key={v} value={v}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={isActive} onCheckedChange={setActive} />
          {um.active}
        </label>
        <Button size="sm" disabled={saving} onClick={submit}>
          <Plus className="size-4" />
          {dict.common.create}
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
