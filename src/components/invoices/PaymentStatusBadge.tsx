import { Badge } from "@/components/ui/badge";
import type { InvoicePaymentStatus } from "@/generated/prisma/client";
import type { Dictionary } from "@/lib/i18n";

interface PaymentStatusBadgeProps {
  status: InvoicePaymentStatus;
  dict: Dictionary;
}

export function PaymentStatusBadge({ status, dict }: PaymentStatusBadgeProps) {
  const t = dict.invoices;
  
  const config: Record<InvoicePaymentStatus, { color: string; label: string }> = {
    UNPAID: { color: "bg-gray-100 text-gray-800", label: t.statusUnpaid },
    PARTIAL: { color: "bg-yellow-100 text-yellow-800", label: t.statusPartial },
    PAID: { color: "bg-green-100 text-green-800", label: t.statusPaid },
    OVERDUE: { color: "bg-red-100 text-red-800", label: t.statusOverdue },
  };
  
  const { color, label } = config[status];
  return <Badge className={color}>{label}</Badge>;
}