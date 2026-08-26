const ARABIC_INDIC_ZERO = "٠".codePointAt(0)!;
const EASTERN_ARABIC_ZERO = "۰".codePointAt(0)!;

export function latinDigits(value: string | number | null | undefined) {
  return String(value ?? "").replace(/[٠-٩۰-۹]/g, (digit) => {
    const code = digit.codePointAt(0)!;
    return String(code >= EASTERN_ARABIC_ZERO
      ? code - EASTERN_ARABIC_ZERO
      : code - ARABIC_INDIC_ZERO);
  });
}

export function rtlPdfDigits(value: string | number | null | undefined) {
  return latinDigits(value).replace(/[0-9][0-9.,:/%+\-]*/g, (token) =>
    Array.from(token).reverse().join("")
  );
}
