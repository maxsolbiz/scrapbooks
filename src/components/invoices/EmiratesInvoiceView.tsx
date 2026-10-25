import type { Invoice } from "@/generated/prisma/client";
import { wordsFromFils } from "@/lib/amount-words";
import { UNITS } from "@/components/invoices/InvoicePrintView";

export interface EmiratesInvoiceData {
  invoice: Invoice & {
    lines: {
      id: string;
      description: string;
      wbtNo: string | null;
      qty: string | number | { toString(): string };
      unit: string;
      rateFils: bigint;
      vatRate: string | number | { toString(): string };
      lineValueFils: bigint;
      lineVatFils: bigint;
      lineTotalFils: bigint;
    }[];
    party: {
      nameEn: string;
      trn: string | null;
      addressEn: string | null;
      phone: string | null;
      email: string | null;
    };
  };
  company: {
    nameEn: string;
    trn: string;
    addressEn: string;
    email: string;
    bankDetailsEn: string;
  };
  template: "emirates-classic" | "emirates-modern";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

function cents(fils: bigint): string {
  const a = fils < 0n ? -fils : fils;
  const d = a / 100n;
  const r = a % 100n;
  return (fils < 0n ? "-" : "") + d.toString() + "." + r.toString().padStart(2, "0");
}

function centsComma(fils: bigint): string {
  const plain = cents(fils);
  const neg = plain.startsWith("-");
  const [ip, fp] = (neg ? plain.slice(1) : plain).split(".");
  const whole = ip.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "-" : "") + whole + "." + fp;
}

function qty3(qty: string | number | { toString(): string }): string {
  const s = String(qty).replace(/[, ]+/g, "").trim();
  const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[2] === "" && (m[3] === undefined || m[3] === ""))) return "0.000";
  const sign = m[1] === "-" ? -1n : 1n;
  const ip = m[2] || "0";
  const fp = m[3] || "";
  const kept4 = (fp + "0000").slice(0, 4);
  let n4 = BigInt(ip + kept4);
  const round = fp.length > 4 ? Number(fp.charAt(4)) : 0;
  if (round >= 5) n4 += 1n;
  const n3 = (n4 + 5n) / 10n;
  if (n3 === 0n) return "0.000";
  return (sign < 0n ? "-" : "") + (n3 / 1000n).toString() + "." + (n3 % 1000n).toString().padStart(3, "0");
}

function rateStr(rateFils: bigint): string {
  const s = cents(rateFils);
  return s.endsWith(".00") ? s.slice(0, -3) : s;
}

function vatPercent(vatRate: string | number | { toString(): string }): string {
  return `${(Number(vatRate) * 100).toFixed(0)}%`;
}

function splitWbt(description: string): { main: string; wbt: string | null } {
  const re = /WBT\s*#\s*\S+/i;
  const m = re.exec(description);
  if (!m) return { main: description, wbt: null };
  return { main: description.slice(0, m.index).trim(), wbt: m[0] };
}

const CERT_CSS = `
.emv { font-family: Calibri, Carlito, Arial, sans-serif; font-size: 8.8pt; color: #000; background: #fff; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
.emv-page { padding: 16px 12px 28px; }
.emv .sheet { width: 6.7in; margin: 0 auto; border: 1px solid #000; }
.emv .inv-title { font-size: 20pt; font-weight: bold; text-align: center; margin: 0 0 8px; }
.emv .head-grid { display: flex; }
.emv .h-left { width: 44.7%; border-right: 1px solid #000; padding: 3px 6px; }
.emv .h-left .lbl { font-weight: bold; }
.emv .h-left .co { font-weight: bold; }
.emv .h-left .from { border-bottom: 1px solid #000; padding-bottom: 3px; }
.emv .h-left .line { padding: 1px 0; line-height: 1.18; }
.emv .h-right { width: 55.3%; display: flex; flex-direction: column; }
.emv .pair-row { display: flex; border-bottom: 1px solid #000; }
.emv .pair { width: 40.3%; padding: 2px 6px; border-right: 1px solid #000; }
.emv .pair:last-child { width: 59.7%; border-right: none; }
.emv .p-lbl { font-weight: bold; }
.emv .p-val { min-height: 12px; padding: 1px 0; }
.emv .terms { flex: 1 1 auto; padding: 2px 6px; }
.emv table.items { width: 100%; border-collapse: collapse; table-layout: fixed; }
.emv .items th { border-top: 1px solid #000; border-bottom: 1px solid #000; text-align: center; font-weight: bold; padding: 3px 2px; vertical-align: top; }
.emv .items td { padding: 3px 5px; vertical-align: top; }
.emv .items td + td, .emv .items th + th { border-left: 1px solid #000; }
.emv .item td { height: 0.30in; font-weight: bold; }
.emv .item td, .emv .filler td { padding-left: 2px; padding-right: 2px; }
.emv .item .num { white-space: nowrap; }
.emv .item .num, .emv .filler .num { text-align: center; }
.emv .item .wbt { display: block; padding-left: 13px; font-size: 8pt; }
.emv .item td.desc { text-align: left; padding-left: 6px; overflow-wrap: anywhere; }
.emv .item td.desc .wbt { padding-left: 0; overflow-wrap: anywhere; word-break: break-word; }
.emv .filler td { height: 2.00in; }
.emv .totrow td { border-top: 1px solid #000; font-weight: bold; text-align: center; height: 0.24in; vertical-align: middle; padding-top: 4px; border-bottom: 1px solid #000; }
.emv .band-c { display: flex; }
.emv .bc-left { width: 66.8%; padding: 3px 6px; }
.emv .bc-left .wl { font-weight: bold; }
.emv .bc-left .words { font-size: 7.3pt; padding: 1px 0 3px 2px; }
.emv .mini { width: 33.2%; border-left: 1px solid #000; border-bottom: 1px solid #000; }
.emv .mrow { display: flex; align-items: baseline; padding: 3px 6px; }
.emv .mrow + .mrow { border-top: 1px solid #000; }
.emv .mrow b { font-weight: bold; white-space: nowrap; }
.emv .mrow .aed { margin-left: auto; padding: 0 4px 0 6px; }
.emv .mrow .mamt { min-width: 0.7in; text-align: right; }
.emv .bank { padding: 6px 6px 4px 18px; }
.emv .bank .b-lbl { font-weight: bold; padding-bottom: 2px; margin-left: -18px; }
.emv .bank .b-line { font-family: Calibri, Carlito, Arial, sans-serif; font-weight: bold; font-size: 10.5pt; line-height: 1.15; }
.emv .band-e { display: flex; }
.emv .decl { width: 52%; padding: 3px 6px; }
.emv .decl .d-h { font-weight: bold; text-decoration: underline; display: inline-block; padding-bottom: 1px; }
.emv .decl p { font-size: 7.3pt; line-height: 1.28; margin: 3px 0 0; }
.emv .sig { width: 48%; border-left: 1px solid #000; border-top: 1px solid #000; display: flex; flex-direction: column; text-align: center; }
.emv .sig .sig-co { font-weight: bold; padding: 3px 4px; }
.emv .stamp-slot { flex: 1 1 auto; min-height: 0.55in; }
.emv .sig .sig-s { font-weight: bold; padding: 3px 4px; }
.emv .foot { text-align: center; margin: 6px 0 0; }
@media print {
  .no-print { display: none !important; }
}
/* Zero page margin: the browser has no header/footer box to draw, so Ctrl+P
   outputs only the invoice sheet. The .emv-page padding supplies the paper inset. */
@page { size: letter; margin: 0; }
.emv.modern .inv-title { color: #1f4e79; }
.emv.modern .items th { background: #f2f4f7; }
.emv.modern .p-lbl, .emv.modern .h-left .lbl, .emv.modern .decl .d-h { background: #f2f4f7; }
.emv.modern .item td { padding: 4px 5px; }
.emv.modern .pair { padding: 3px 6px; }
.emv.modern .mrow { padding: 4px 6px; }
.emv.modern .p-lbl { padding-right: 6px; }
.emv.modern .totrow td { background: #1f4e79; color: #fff; }
.emv.modern .mrow.grand { background: #1f4e79; color: #fff; }
.emv.modern .mrow.grand b, .emv.modern .mrow.grand .aed, .emv.modern .mrow.grand .mamt { color: #fff; }
`;

export function EmiratesInvoiceView({ data }: { data: EmiratesInvoiceData }) {
  const { invoice, company, template } = data;
  const lines = invoice.lines;
  const vatFils = invoice.vatFils;
  const allZeroVat = lines.every((l) => Number(l.vatRate) === 0);

  const fromBlock =
    invoice.direction === "SALES"
      ? [
          { co: true, text: company.nameEn },
          { co: false, text: company.trn || "" },
          { co: false, text: company.email || "" },
          { co: false, text: company.addressEn || "" },
          { co: false, text: "UNITED ARAB EMIRATES" },
        ]
      : [
          { co: true, text: invoice.party.nameEn },
          { co: false, text: invoice.party.addressEn || "" },
          { co: false, text: invoice.trnSnapshot || invoice.party.trn || "" },
          { co: false, text: invoice.party.phone || "" },
          { co: false, text: invoice.party.email || "" },
          { co: false, text: "UNITED ARAB EMIRATES" },
        ];
  const toBlock =
    invoice.direction === "SALES"
      ? [
          { co: true, text: invoice.party.nameEn },
          { co: false, text: invoice.party.addressEn || "" },
          { co: false, text: invoice.trnSnapshot || invoice.party.trn || "" },
          { co: false, text: invoice.party.phone || "" },
          { co: false, text: invoice.party.email || "" },
          { co: false, text: "UNITED ARAB EMIRATES" },
        ]
      : [
          { co: true, text: company.nameEn },
          { co: false, text: company.trn || "" },
          { co: false, text: company.email || "" },
          { co: false, text: company.addressEn || "" },
          { co: false, text: "UNITED ARAB EMIRATES" },
        ];
  const rowBlocks = [
    { left: "Invoice No.", right: "Dated", leftVal: invoice.invoiceNo, rightVal: fmtDate(invoice.date) },
    { left: "Supplier's Ref", right: "Date of Supply", leftVal: invoice.supplierRef || "", rightVal: "" },
    { left: "Purchase Order", right: "Mode/Terms of Payment", leftVal: invoice.purchaseOrder || "", rightVal: invoice.modeOfPayment || "" },
    { left: "Delivery Note", right: "Delivery Note Date", leftVal: invoice.deliveryNote || "", rightVal: invoice.deliveryNoteDate ? fmtDate(new Date(invoice.deliveryNoteDate)) : "" },
    { left: "Vehicle #", right: "Destination", leftVal: invoice.vehicleNo || "", rightVal: invoice.party.addressEn || "" },
  ];
  const bankLines = (company.bankDetailsEn || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const unitLabel = (u: string) => UNITS[u]?.en ?? u.toLowerCase();

  return (
    <div className={`emv${template === "emirates-modern" ? " modern" : ""}`} dir="ltr">
      <style>{CERT_CSS}</style>
      <div className="emv-page">
        <h1 className="inv-title">TAX INVOICE</h1>
        <div className="sheet">
          <div className="head-grid">
            <div className="h-left">
              <div className="from">
                <div className="lbl">FROM:</div>
                {fromBlock.map((r, i) =>
                  r.text ? (
                    <div className={`line${r.co ? " co" : ""}`} key={`f${i}`}>{r.text}</div>
                  ) : null,
                )}
              </div>
              <div className="to">
                <div className="lbl">TO:</div>
                {toBlock.map((r, i) =>
                  r.text ? (
                    <div className={`line${r.co ? " co" : ""}`} key={`t${i}`}>{r.text}</div>
                  ) : null,
                )}
              </div>
            </div>
            <div className="h-right">
              {rowBlocks.map((row, i) => (
                <div className="pair-row" key={`p${i}`}>
                  <div className="pair">
                    <div className="p-lbl">{row.left}</div>
                    <div className="p-val">{row.leftVal}</div>
                  </div>
                  <div className="pair">
                    <div className="p-lbl">{row.right}</div>
                    <div className="p-val">{row.rightVal}</div>
                  </div>
                </div>
              ))}
              <div className="terms">
                <div className="p-lbl">Terms Of Delivery</div>
                {invoice.termsOfDelivery ? <div className="p-val">{invoice.termsOfDelivery}</div> : null}
              </div>
            </div>
          </div>
          <table className="items">
            <colgroup>
              <col style={{ width: "3.8%" }} />
              <col style={{ width: "40.9%" }} />
              <col style={{ width: "7.2%" }} />
              <col style={{ width: "5.1%" }} />
              <col style={{ width: "9.8%" }} />
              <col style={{ width: "6.5%" }} />
              <col style={{ width: "12.9%" }} />
              <col style={{ width: "13.8%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Sr.#</th>
                <th>Description of Goods</th>
                <th>Weight<br />Tons</th>
                <th>Rate</th>
                <th>Amount<br />Excl. Vat</th>
                <th>Rate of<br />Tax</th>
                <th>{vatFils === 0n ? "VAT (RCM)" : "VAT"}</th>
                <th>Total Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => {
                // Explicit wbtNo column wins; fall back to a "WBT #..." suffix
                // in the description for legacy data.
                const wbtField = l.wbtNo?.trim();
                const wbt = wbtField
                  ? { main: l.description.trim(), wbt: `WBT # ${wbtField}` }
                  : splitWbt(l.description);
                const isTon = l.unit === "TON";
                return (
                  <tr className="item" key={l.id}>
                    <td className="num">{idx + 1}</td>
                    <td className="desc">
                      {wbt.main}
                      {wbt.wbt ? <span className="wbt">{wbt.wbt}</span> : null}
                    </td>
                    <td className="num">
                      {qty3(l.qty)}
                      {!isTon ? <span className="wbt">{unitLabel(l.unit)}</span> : null}
                    </td>
                    <td className="num">{rateStr(l.rateFils)}</td>
                    <td className="num">{cents(l.lineValueFils)}</td>
                    <td className="num">{vatPercent(l.vatRate)}</td>
                    <td className="num">{cents(l.lineVatFils)}</td>
                    <td className="num">{cents(l.lineTotalFils)}</td>
                  </tr>
                );
              })}
              {lines.length < 2 ? <tr className="filler">{Array.from({ length: 8 }, (_, i) => <td key={i} />)}</tr> : null}
              <tr className="totrow">
                <td colSpan={2}>TOTAL</td>
                <td>{qty3(sumQty(lines))}</td>
                <td />
                <td>{cents(invoice.subtotalFils)}</td>
                <td>{allZeroVat ? "0%" : "--"}</td>
                <td>{cents(vatFils)}</td>
                <td>{cents(invoice.totalFils)}</td>
              </tr>
            </tbody>
          </table>
          <div className="band-c">
            <div className="bc-left">
              <div className="wl">Amount Chargeable In Words</div>
              <div className="words">{wordsFromFils(invoice.totalFils)}</div>
              <div className="wl">Vat Amount In Words</div>
              <div className="words">{vatFils === 0n ? "No Dirham and No Fils" : wordsFromFils(vatFils)}</div>
            </div>
            <div className="mini">
              <div className="mrow">
                <b>Amount Excl. Vat</b>
                <span className="aed">AED</span>
                <span className="mamt">{centsComma(invoice.subtotalFils)}</span>
              </div>
              <div className="mrow">
                <b>{vatFils === 0n ? "Vat OOS" : "VAT"}</b>
                <span className="aed">AED</span>
                <span className="mamt">{vatFils === 0n ? "-" : centsComma(vatFils)}</span>
              </div>
              <div className="mrow grand">
                <b>Total Amount</b>
                <span className="aed">AED</span>
                <span className="mamt">{centsComma(invoice.totalFils)}</span>
              </div>
            </div>
          </div>
          {bankLines.length > 0 ? (
            <div className="bank">
              <div className="b-lbl">BANK DETAILS:</div>
              {bankLines.map((s, i) => (
                <div className="b-line" key={`b${i}`}>{s}</div>
              ))}
            </div>
          ) : null}
          <div className="band-e">
            <div className="decl">
              {allZeroVat ? (
                <>
                  <div className="d-h">Declaration</div>
                  <p>
                    (Effective from 14th Jan-2026, the Sale of scrap metal,and shall be used exclusively for
                    processing reasle of scrap metal in the normal course of its business activities, as per the
                    provisions of Federal Decree Law No.8 of 2017 of Value added Tax under the reverse charge
                    Mechanism in accordance with cabinet decision no.153 of 2025 shifting VAT accounting from the
                    supplier to the buyer.
                  </p>
                </>
              ) : null}
            </div>
            <div className="sig">
              <div className="sig-co">{company.nameEn}</div>
              <div className="stamp-slot" />
              <div className="sig-s">Authorised Signatory</div>
            </div>
          </div>
        </div>
        <div className="foot">This is a Computer Generated Invoice</div>
      </div>
    </div>
  );
}

function sumQty(lines: EmiratesInvoiceData["invoice"]["lines"]): string {
  let total3 = 0n;
  for (const l of lines) {
    const s = String(l.qty).replace(/[, ]+/g, "").trim();
    const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(s);
    if (m && !(m[2] === "" && (m[3] === undefined || m[3] === ""))) {
      const sign = m[1] === "-" ? -1n : 1n;
      const ip = m[2] || "0";
      const fp = m[3] || "";
      const kept4 = (fp + "0000").slice(0, 4);
      let n4 = BigInt(ip + kept4);
      const round = fp.length > 4 ? Number(fp.charAt(4)) : 0;
      if (round >= 5) n4 += 1n;
      total3 += sign * ((n4 + 5n) / 10n);
    }
  }
  const neg = total3 < 0n;
  const a = neg ? -total3 : total3;
  const cents = (a + 5n) / 10n;
  return (neg && cents > 0n ? "-" : "") + (cents / 100n).toString() + "." + (cents % 100n).toString().padStart(2, "0");
}
