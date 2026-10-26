"use client";

import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export function PrintButton({ label }: { label: string }) {
  return (
    <Button variant="outline" onClick={() => window.print()} className="no-print w-full sm:w-auto">
      <Printer className="size-4" /> {label}
    </Button>
  );
}
