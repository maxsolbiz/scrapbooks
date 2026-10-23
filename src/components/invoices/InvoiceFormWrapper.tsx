"use client";

import dynamic from "next/dynamic";
import { InvoiceFormSkeleton } from "@/components/invoices/InvoiceFormSkeleton";

const InvoiceFormClient = dynamic(
  () => import("@/components/invoices/InvoiceFormClient").then((mod) => mod.InvoiceFormClient),
  { ssr: false, loading: () => <InvoiceFormSkeleton /> }
);

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