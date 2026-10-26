"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export function BackButton({ label }: { label: string }) {
  return (
    <Button variant="outline" onClick={() => window.history.back()} className="no-print w-full sm:w-auto">
      <ArrowLeft className="size-4" /> {label}
    </Button>
  );
}
