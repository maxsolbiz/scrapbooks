import { cookies } from "next/headers";

export type Locale = "en" | "ar";

export const LOCALE_COOKIE = "scrapbooks-locale";

const en = {
  appName: "ScrapBooks",
  appSub: "Accounting & Ledger",
  nav: {
    dashboard: "Dashboard",
    accounts: "Chart of Accounts",
    journals: "Journal Vouchers",
    sales: "Sales Invoices",
    purchases: "Purchase Invoices",
    payments: "Payments & Receipts",
    parties: "Customers & Vendors",
    items: "Scrap Items",
    reports: "Reports",
    settings: "Settings",
    users: "Users",
    fiscalYears: "Fiscal Years",
    logout: "Sign out",
  },
  auth: {
    signIn: "Sign in",
    email: "Email",
    password: "Password",
    error: "Invalid email or password",
    title: "Sign in to ScrapBooks",
  },
  common: {
    save: "Save",
    cancel: "Cancel",
    create: "Create",
    edit: "Edit",
    delete: "Delete",
    void: "Void",
    post: "Post",
    view: "View",
    print: "Print",
    back: "Back",
    actions: "Actions",
    status: "Status",
    date: "Date",
    amount: "Amount",
    type: "Type",
    code: "Code",
    name: "Name",
    nameEn: "Name (English)",
    nameAr: "Name (Arabic)",
    reference: "Reference",
    description: "Description",
    notes: "Notes",
    total: "Total",
    from: "From",
    to: "To",
    apply: "Apply",
    empty: "No records found",
    loading: "Loading…",
    required: "Required",
    balance: "Balance",
    debit: "Debit",
    credit: "Credit",
    subtotal: "Subtotal",
    vat: "VAT",
    grandTotal: "Grand Total",
    narration: "Narration",
  },
  dashboard: {
    title: "Dashboard",
    cashBalance: "Cash on Hand",
    bankBalance: "Bank Balance",
    receivables: "Receivables",
    payables: "Payables",
    revenueThisMonth: "Revenue (this month)",
    recentEntries: "Recent Journal Entries",
  },
  accounts: {
    new: "New account",
    edit: "Edit account",
    group: "Group",
    account: "Account",
    parent: "Parent",
    type: "Type",
    actions_warning_group: "Group accounts cannot be used in journal lines",
    cannotDelete: "Accounts in use cannot be deleted — deactivate instead",
  },
  journals: {
    new: "New journal voucher",
    lines: "Lines",
    addLine: "Add line",
    unbalanced: "Debits and credits are not equal",
    needTwoLines: "Add at least two lines",
    oneSide: "Each line must be either a debit or a credit",
    zeroLine: "Zero-amount lines are not allowed",
    posted: "Journal posted",
    viewEntry: "View entry",
    entryNo: "Entry No.",
    source: "Source",
    voidEntry: "Void this entry",
    voidConfirm: "Void this entry? The line data stays for the audit trail.",
  },
  error: {
    generic: "Something went wrong",
  },
};

const ar: typeof en = {
  appName: "سكراب بوكس",
  appSub: "المحاسبة والدفاتر",  nav: {
    dashboard: "لوحة التحكم",
    accounts: "دليل الحسابات",
    journals: "سندات القيود",
    sales: "فواتير البيع",
    purchases: "فواتير الشراء",
    payments: "السدد والمقبوضات",
    parties: "العملاء والموردون",
    items: "أنواع الخردة",
    reports: "التقارير",
    settings: "الإعدادات",
    users: "المستخدمون",
    fiscalYears: "السنوات المالية",
    logout: "تسجيل الخروج",
  },
  auth: {
    signIn: "دخول",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    error: "البريد الإلكتروني أو كلمة المرور غير صحيحة",
    title: "تسجيل الدخول إلى سكراب بوكس",
  },
  common: {
    save: "حفظ",
    cancel: "إلغاء",
    create: "إنشاء",
    edit: "تعديل",
    delete: "حذف",
    void: "إلغاء القيد",
    post: "ترحيل",
    view: "عرض",
    print: "طباعة",
    back: "رجوع",
    actions: "إجراءات",
    status: "الحالة",
    date: "التاريخ",
    amount: "المبلغ",
    type: "النوع",
    code: "الرمز",
    name: "الاسم",
    nameEn: "الاسم (بالإنجليزية)",
    nameAr: "الاسم (بالعربية)",
    reference: "المرجع",
    description: "الوصف",
    notes: "ملاحظات",
    total: "الإجمالي",
    from: "من",
    to: "إلى",
    apply: "تطبيق",
    empty: "لا توجد سجلات",
    loading: "جارٍ التحميل…",
    required: "مطلوب",
    balance: "الرصيد",
    debit: "مدين",
    credit: "دائن",
    subtotal: "المجموع قبل الضريبة",
    vat: "ضريبة القيمة المضافة",
    grandTotal: "الإجمالي مع الضريبة",
    narration: "البيان",
  },
  dashboard: {
    title: "لوحة التحكم",
    cashBalance: "النقد في الصندوق",
    bankBalance: "الرصيد البنكي",
    receivables: "المدينون",
    payables: "الدائنون",
    revenueThisMonth: "الإيراد (هذا الشهر)",
    recentEntries: "أحدث سندات القيود",
  },
  accounts: {
    new: "حساب جديد",
    edit: "تعديل الحساب",
    group: "مجموعة",
    account: "الحساب",
    parent: "الأصل",
    type: "النوع",
    actions_warning_group: "لا يمكن القيد على حسابات المجموعة",
    cannotDelete: "الحسابات المستخدمة لا تُحذف — قم بإلغاء تنشيطها",
  },
  journals: {
    new: "سند قيد جديد",
    lines: "الأسطر",
    addLine: "إضافة سطر",
    unbalanced: "المدين والدائن غير متساويين",
    needTwoLines: "أضف سطرين على الأقل",
    oneSide: "كل سطر إما مدين أو دائن",
    zeroLine: "لا تُسمح بالأسطر ذات قيمة صفر",
    posted: "تم ترحيل القيد",
    viewEntry: "عرض القيد",
    entryNo: "رقم القيد",
    source: "المصدر",
    voidEntry: "إلغاء هذا القيد",
    voidConfirm: "الإلغاء؟ تُحفظ الأسطر لأغراض التدقيق.",
  },
  error: {
    generic: "حدث خطأ ما",
  },
};

export type Dictionary = typeof en;

const dictionaries: Record<Locale, Dictionary> = { en, ar };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? en;
}

export function isRtl(locale: Locale): boolean {
  return locale === "ar";
}

/** Server-side: read the locale from cookie. Call in layouts/pages. */
export async function getServerLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return value === "ar" ? "ar" : "en";
}

/** Flatten a dict key like "nav.dashboard" */
export function translate(dict: Dictionary, key: string): string {
  const parts = key.split(".");
  let node: unknown = dict;
  for (const part of parts) {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return key;
    }
  }
  return typeof node === "string" ? node : key;
}
