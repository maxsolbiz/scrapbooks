import { chromium } from "playwright";
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
await p.fill('input[type="email"]', "admin@maxsolbiz.com");
await p.fill('input[type="password"]', "Start@123");
await p.locator("form button[type=submit], form button:not([type=button])").last().click();
await p.waitForURL((u) => !String(u).includes("/login"), { timeout: 60000 });
await p.goto("http://localhost:3000/sales-invoices/cmvoe7881000rxs0gx2uhvhhx/print?template=emirates-classic", { waitUntil: "networkidle", timeout: 90000 });
await p.waitForTimeout(600);
const app = await p.evaluate(() => {
  const th = document.querySelector(".emv .items th");
  const td = document.querySelector(".emv .item td.num");
  const tdRate = document.querySelectorAll(".emv .item td.num")[3];
  const pick = (el) => {
    const cs = getComputedStyle(el);
    return { f: cs.fontFamily, z: cs.fontSize, w: cs.fontWeight, s: getComputedStyle(el).fontStretch, lh: cs.lineHeight, ls: cs.letterSpacing };
  };
  return JSON.stringify({ th: pick(th), td: pick(td), tdRate: tdRate && pick(tdRate) });
});
await p.goto("file:///D:/Arslan/invoice-templates/invoice.html", { waitUntil: "networkidle" });
const html = await p.evaluate(() => {
  const th = document.querySelector(".items th");
  const td = document.querySelector(".item td.num");
  const tdRate = document.querySelectorAll(".item td.num")[3];
  const pick = (el) => {
    const cs = getComputedStyle(el);
    return { f: cs.fontFamily, z: cs.fontSize, w: cs.fontWeight, s: getComputedStyle(el).fontStretch, lh: cs.lineHeight, ls: cs.letterSpacing };
  };
  return JSON.stringify({ th: pick(th), td: pick(td), tdRate: tdRate && pick(tdRate) });
});
console.log("APP :", app);
console.log("HTML:", html);
await b.close();
