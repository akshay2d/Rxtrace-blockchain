const GS = String.fromCharCode(29);

export function generateUnitGS1(data: {
  gtin: string; exp: string; mfd: string;
  batch: string; serial: string;
  mrp: string; sku: string; company: string;
}) {
  return `(01)${data.gtin}(17)${data.exp}(11)${data.mfd}(10)${data.batch}${GS}` +
         `(21)${data.serial}(91)${data.mrp}(92)${data.sku}(93)${data.company}`;
}

export function generateSSCC(companyPrefix: string, serial: string) {
  return `00${companyPrefix}${serial}`;
}
