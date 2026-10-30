type CoaRow = {
  code: string;
  nameEn: string;
  nameAr: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
  normalBalance: "DEBIT" | "CREDIT";
  group?: boolean;
  parentCode?: string;
  cashFlow?: "OPERATING" | "INVESTING" | "FINANCING" | "NONE";
};
/**
 * The canonical chart of accounts. Side-effect-free data module: safe for both
 * prisma/seed.ts and test harnesses to import.
 */
export const COA: CoaRow[] = [
  { code: "1000", nameEn: "Assets", nameAr: "الأصول", type: "ASSET", normalBalance: "DEBIT", group: true },
  { code: "1100", nameEn: "Current Assets", nameAr: "الأصول المتداولة", type: "ASSET", normalBalance: "DEBIT", group: true, parentCode: "1000" },
  { code: "1110", nameEn: "Cash on Hand", nameAr: "النقد في الصندوق", type: "ASSET", normalBalance: "DEBIT", parentCode: "1100", cashFlow: "OPERATING" },
  { code: "1120", nameEn: "Bank - Current Account", nameAr: "الحساب الجاري البنكي", type: "ASSET", normalBalance: "DEBIT", parentCode: "1100", cashFlow: "OPERATING" },
  { code: "1130", nameEn: "Accounts Receivable", nameAr: "الذمم المدينة", type: "ASSET", normalBalance: "DEBIT", parentCode: "1100" },
  { code: "1150", nameEn: "Fixed Assets", nameAr: "الأصول الثابتة", type: "ASSET", normalBalance: "DEBIT", group: true, parentCode: "1000" },
  { code: "1510", nameEn: "Equipment & Machinery", nameAr: "المعدات والآلات", type: "ASSET", normalBalance: "DEBIT", parentCode: "1150", cashFlow: "INVESTING" },
  { code: "2000", nameEn: "Liabilities", nameAr: "الالتزامات", type: "LIABILITY", normalBalance: "CREDIT", group: true },
  { code: "2100", nameEn: "Accounts Payable", nameAr: "الذمم الدائنة", type: "LIABILITY", normalBalance: "CREDIT", parentCode: "2000" },
  { code: "2150", nameEn: "VAT Payable (FTA)", nameAr: "ضريبة القيمة المضافة المستحقة", type: "LIABILITY", normalBalance: "CREDIT", parentCode: "2000" },
  { code: "2200", nameEn: "Salaries Payable", nameAr: "رواتب مستحقة", type: "LIABILITY", normalBalance: "CREDIT", parentCode: "2000" },
  { code: "3000", nameEn: "Equity", nameAr: "حقوق الملكية", type: "EQUITY", normalBalance: "CREDIT", group: true },
  { code: "3100", nameEn: "Owner's Capital", nameAr: "رأس مال المالك", type: "EQUITY", normalBalance: "CREDIT", parentCode: "3000" },
  { code: "3900", nameEn: "Retained Earnings", nameAr: "الأرباح المحتجزة", type: "EQUITY", normalBalance: "CREDIT", parentCode: "3000" },
  { code: "4000", nameEn: "Income", nameAr: "الإيرادات", type: "INCOME", normalBalance: "CREDIT", group: true },
  { code: "4100", nameEn: "Scrap Sales Revenue", nameAr: "إيرادات بيع الخردة", type: "INCOME", normalBalance: "CREDIT", parentCode: "4000", cashFlow: "OPERATING" },
  { code: "4200", nameEn: "Other Income", nameAr: "إيرادات أخرى", type: "INCOME", normalBalance: "CREDIT", parentCode: "4000", cashFlow: "OPERATING" },
  { code: "5000", nameEn: "Expenses", nameAr: "المصروفات", type: "EXPENSE", normalBalance: "DEBIT", group: true },
  { code: "5100", nameEn: "Cost of Goods Purchased", nameAr: "تكلفة شراء السلع", type: "EXPENSE", normalBalance: "DEBIT", parentCode: "5000", cashFlow: "OPERATING" },
  { code: "5200", nameEn: "Salaries & Wages", nameAr: "الرواتب والأجور", type: "EXPENSE", normalBalance: "DEBIT", parentCode: "5000", cashFlow: "OPERATING" },
  { code: "5300", nameEn: "Rent Expense", nameAr: "مصروف الإيجار", type: "EXPENSE", normalBalance: "DEBIT", parentCode: "5000", cashFlow: "OPERATING" },
  { code: "5400", nameEn: "Utilities", nameAr: "المرافق", type: "EXPENSE", normalBalance: "DEBIT", parentCode: "5000", cashFlow: "OPERATING" },
  { code: "5500", nameEn: "Fuel & Transport", nameAr: "الوقود والنقل", type: "EXPENSE", normalBalance: "DEBIT", parentCode: "5000", cashFlow: "OPERATING" },
  { code: "5600", nameEn: "Bank Charges", nameAr: "مصاريف بنكية", type: "EXPENSE", normalBalance: "DEBIT", parentCode: "5000", cashFlow: "OPERATING" },
  { code: "5700", nameEn: "Sales Deductions", nameAr: "خصومات المبيعات", type: "EXPENSE", normalBalance: "DEBIT", parentCode: "5000", cashFlow: "OPERATING" },
  { code: "5800", nameEn: "Purchase Deductions", nameAr: "خصومات المشتريات", type: "INCOME", normalBalance: "CREDIT", parentCode: "4000", cashFlow: "OPERATING" },
  { code: "5900", nameEn: "Miscellaneous Expense", nameAr: "مصروفات متنوعة", type: "EXPENSE", normalBalance: "DEBIT", parentCode: "5000", cashFlow: "OPERATING" },
];
export type { CoaRow };
