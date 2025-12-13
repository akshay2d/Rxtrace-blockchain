// app/lib/sscc.ts
export function computeGs1CheckDigit(number17: string) {
  // number17 must be numeric string length 17
  const digits = number17.split("").map((d) => parseInt(d, 10));
  // weights from right: 3,1,3,1...
  let sum = 0;
  for (let i = digits.length - 1, pos = 0; i >= 0; i--, pos++) {
    const w = pos % 2 === 0 ? 3 : 1;
    sum += digits[i] * w;
  }
  const mod = sum % 10;
  const check = mod === 0 ? 0 : 10 - mod;
  return String(check);
}

export function makeSscc() {
  // Build a 17-digit numeric string: 1 extension digit + 12 digits from timestamp + 4 random digits
  const ext = String(Math.floor(Math.random() * 9) + 1); // 1-9
  const ts = String(Date.now()).slice(-12).padStart(12, "0"); // last 12 digits of ms
  const rnd = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  const number17 = (ext + ts + rnd).slice(0, 17);
  const check = computeGs1CheckDigit(number17);
  return number17 + check; // 18-digit SSCC
}

export function makeUnitUid() {
  // create 16-24 char unique id (not GS1); keep simple and numeric+alpha
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `U-${t}-${r}`;
}
