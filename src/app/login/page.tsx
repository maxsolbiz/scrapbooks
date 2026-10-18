"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useT } from "@/components/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export default function LoginPage() {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState(false);
  const [lockedOut, setLockedOut] = useState(false);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    setError(false);
    setLockedOut(false);
    const res = await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
    });
    if (res?.code === "rate_limited") {
      setLockedOut(true);
      return;
    }
    if (res?.error) {
      setError(true);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-semibold">{t.appName}</CardTitle>
          <p className="text-sm text-muted-foreground">{t.auth.title}</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t.auth.email}</Label>
              <Input id="email" type="email" autoComplete="username" {...form.register("email")} />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">{t.common.required}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t.auth.password}</Label>
              <Input id="password" type="password" autoComplete="current-password" {...form.register("password")} />
              {form.formState.errors.password && (
                <p className="text-xs text-destructive">{t.common.required}</p>
              )}
            </div>
            {lockedOut && <p className="text-sm text-destructive text-center">{t.auth.lockedOut}</p>}
            {!lockedOut && error && <p className="text-sm text-destructive text-center">{t.auth.error}</p>}
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {t.auth.signIn}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
