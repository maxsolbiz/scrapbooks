"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BookText, Loader2 } from "lucide-react";
import { useT } from "@/components/i18n/LocaleProvider";
import { LoginBrandPanel } from "@/components/auth/LoginBrandPanel";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

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
    <main className="flex min-h-dvh bg-background">
      <LoginBrandPanel />

      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:[animation-delay:180ms]">
          {/* Compact brand header on small screens */}
          <div className="mb-8 flex items-center justify-center gap-2.5 lg:hidden">
            <span className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <BookText className="size-4.5" />
            </span>
            <span>
              <span className="block font-semibold leading-tight tracking-tight">{t.appName}</span>
              <span className="block text-[10px] leading-tight text-muted-foreground">{t.appSub}</span>
            </span>
          </div>

          <Card className="border-border/70 shadow-sm">
            <CardContent className="grid gap-6 p-6 sm:p-8">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">{t.auth.welcome}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t.auth.workspace}</p>
              </div>

              <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="email">{t.auth.email}</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    aria-invalid={!!form.formState.errors.email}
                    aria-describedby={form.formState.errors.email ? "email-error" : undefined}
                    {...form.register("email")}
                  />
                  {form.formState.errors.email && (
                    <p id="email-error" className="motion-safe:animate-in motion-safe:fade-in text-xs text-destructive">
                      {t.common.required}
                    </p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">{t.auth.password}</Label>
                  <PasswordInput
                    id="password"
                    autoComplete="current-password"
                    aria-invalid={!!form.formState.errors.password}
                    aria-describedby={form.formState.errors.password ? "password-error" : undefined}
                    {...form.register("password")}
                  />
                  {form.formState.errors.password && (
                    <p id="password-error" className="motion-safe:animate-in motion-safe:fade-in text-xs text-destructive">
                      {t.common.required}
                    </p>
                  )}
                </div>

                <div aria-live="polite">
                  {lockedOut && (
                    <p className="text-sm text-destructive">{t.auth.lockedOut}</p>
                  )}
                  {error && !lockedOut && (
                    <p className="text-sm text-destructive">{t.auth.error}</p>
                  )}
                </div>

                <Button type="submit" className="w-full gap-2" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                  {t.auth.signIn}
                </Button>
              </form>

              <p className="text-center text-xs text-muted-foreground lg:hidden">
                © {new Date().getFullYear()} {t.appName} · {t.auth.poweredBy}{" "}
                <a
                  href="https://maxsolbiz.com"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline underline-offset-4 transition-colors hover:text-foreground"
                >
                  MaxSolBiz IT Solutions
                </a>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
