import { prisma } from "@/lib/db";

export interface VAT201Filter {
  fiscalYearId: string;
  fromDate: Date;
  toDate: Date;
}

export interface VAT201Box {
  label: string;
  amountFils: bigint;
  vatFils: bigint;
}

export interface VAT201Return {
  fiscalYearName: string;
  periodStart: Date;
  periodEnd: Date;
  box1: VAT201Box; // Standard-rated sales
  box2: VAT201Box; // VAT on standard-rated sales
  box3: VAT201Box; // Zero-rated sales
  box6: VAT201Box; // Standard-rated purchases
  box7: VAT201Box; // VAT on standard-rated purchases
  box8Sales: VAT201Box; // Sales deductions (base)
  box9Sales: VAT201Box; // VAT on sales deductions
  box8Purchase: VAT201Box; // Purchase deductions (base)
  box9Purchase: VAT201Box; // VAT on purchase deductions
  netVatPayable: bigint;
}

export async function calculateVAT201(filters: VAT201Filter): Promise<VAT201Return> {
  const fy = await prisma.fiscalYear.findUniqueOrThrow({ where: { id: filters.fiscalYearId } });

  const invoices = await prisma.invoice.findMany({
    where: {
      status: "POSTED",
      date: { gte: filters.fromDate, lte: filters.toDate },
    },
    include: {
      deductions: { select: { baseAmountFils: true, vatFils: true } },
    },
  });

  let salesBase = 0n,
    salesVat = 0n,
    zeroRatedSales = 0n;
  let purchaseBase = 0n,
    purchaseVat = 0n;
  let salesDeductionBase = 0n,
    salesDeductionVat = 0n,
    purchaseDeductionBase = 0n,
    purchaseDeductionVat = 0n;

  for (const inv of invoices) {
    const isZeroRate = Number(inv.vatFils) === 0 && Number(inv.subtotalFils) > 0;
    if (inv.direction === "SALES") {
      if (isZeroRate) {
        zeroRatedSales += inv.subtotalFils;
      } else {
        salesBase += inv.subtotalFils;
        salesVat += inv.vatFils;
      }
      for (const d of inv.deductions) {
        salesDeductionBase += d.baseAmountFils;
        salesDeductionVat += d.vatFils;
      }
    } else if (inv.direction === "PURCHASE") {
      purchaseBase += inv.subtotalFils;
      purchaseVat += inv.vatFils;
      for (const d of inv.deductions) {
        purchaseDeductionBase += d.baseAmountFils;
        purchaseDeductionVat += d.vatFils;
      }
    }
  }

  const netVatPayable = (salesVat + salesDeductionVat) - (purchaseVat + purchaseDeductionVat);

  return {
    fiscalYearName: fy.name,
    periodStart: filters.fromDate,
    periodEnd: filters.toDate,
    box1: { label: "Standard-rated supplies (D1 base)", amountFils: salesBase, vatFils: 0n },
    box2: { label: "VAT on standard-rated sales", amountFils: 0n, vatFils: salesVat },
    box3: { label: "Zero-rated sales (base only)", amountFils: zeroRatedSales, vatFils: 0n },
    box6: { label: "Standard-rated purchases (D1 base)", amountFils: purchaseBase, vatFils: 0n },
    box7: { label: "VAT on standard-rated purchases", amountFils: 0n, vatFils: purchaseVat },
    box8Sales: { label: "Sales adjustments / deductions (base)", amountFils: salesDeductionBase, vatFils: 0n },
    box9Sales: { label: "VAT on sales adjustments", amountFils: 0n, vatFils: salesDeductionVat },
    box8Purchase: { label: "Purchase adjustments / deductions (base)", amountFils: purchaseDeductionBase, vatFils: 0n },
    box9Purchase: { label: "VAT on purchase adjustments", amountFils: 0n, vatFils: purchaseDeductionVat },
    netVatPayable,
  };
}
