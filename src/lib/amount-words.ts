const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

const GROUPS = ["", " Thousand", " Million", " Billion", " Trillion"];

function wordsInt(n: bigint): string {
  if (n === 0n) return "Zero";
  let rest = n;
  let i = 0;
  const parts: string[] = [];
  while (rest > 0n) {
    const chunk = rest % 1000n;
    if (chunk > 0n) {
      const w: string[] = [];
      const h = chunk / 100n;
      const tail = chunk % 100n;
      if (h > 0n) w.push(ONES[Number(h)], "Hundred");
      if (tail > 0n) {
        const t = Number(tail);
        if (t < 20) w.push(ONES[t]);
        else {
          const tens = TENS[Math.floor(t / 10)];
          const o = t % 10;
          w.push(o > 0 ? `${tens} ${ONES[o]}` : tens);
        }
      }
      parts.unshift(w.join(" ").trim() + GROUPS[i]);
    }
    rest /= 1000n;
    i++;
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function wordsFromFils(fils: bigint): string {
  if (fils === 0n) return "No Dirham and No Fils";
  const neg = fils < 0n;
  const a = neg ? -fils : fils;
  const dir = a / 100n;
  const fil = a % 100n;
  const dw = dir > 0n ? `${wordsInt(dir)} Dirham` : "No Dirham";
  const fw = fil > 0n ? `${wordsInt(fil)} Fils` : "No Fils";
  return (neg ? "Minus " : "") + dw + " and " + fw;
}
