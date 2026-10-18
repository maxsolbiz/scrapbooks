"use client";

import { useState } from "react";
import { forwardRef } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useT } from "@/components/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

export const PasswordInput = forwardRef<HTMLInputElement, Omit<React.ComponentProps<"input">, "type">>(
  function PasswordInput({ className, ...props }, ref) {
    const t = useT();
    const [show, setShow] = useState(false);
    return (
      <div className="relative">
        <Input
          ref={ref}
          type={show ? "text" : "password"}
          className={cn("pe-10", className)}
          {...props}
        />
        <button
          type="button"
          tabIndex={0}
          aria-label={show ? t.auth.hidePassword : t.auth.showPassword}
          aria-pressed={show}
          onClick={() => setShow((s) => !s)}
          className="absolute end-0 top-0 flex h-full w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-e-md"
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    );
  },
);
