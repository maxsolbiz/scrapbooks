"use client";

import { InvoiceFormClient } from "@/components/invoices/InvoiceFormClient";

interface InvoiceFormWrapperProps {
  direction: "SALES" | "PURCHASE";
  parties: any[];
  items: any[];
  dict: any;
  today: string;
}

export function InvoiceFormWrapper({
  direction,
  parties,
  items,
  dict,
  today,
}: InvoiceFormWrapperProps) {
  return <InvoiceFormClient direction={direction} parties={parties} items={items} dict={dict} today={today} />;
}