"use client";

import { InvoiceFormClient, type ReviseFromData } from "@/components/invoices/InvoiceFormClient";

interface InvoiceFormWrapperProps {
  direction: "SALES" | "PURCHASE";
  parties: any[];
  items: any[];
  dict: any;
  today: string;
  defaultVatRate: string;
  reviseFrom?: ReviseFromData | null;
  amendReason?: string;
}

export function InvoiceFormWrapper({
  direction,
  parties,
  items,
  dict,
  today,
  defaultVatRate,
  reviseFrom,
  amendReason,
}: InvoiceFormWrapperProps) {
  return (
    <InvoiceFormClient
      direction={direction}
      parties={parties}
      items={items}
      dict={dict}
      today={today}
      defaultVatRate={defaultVatRate}
      reviseFrom={reviseFrom}
      amendReason={amendReason}
    />
  );
}
