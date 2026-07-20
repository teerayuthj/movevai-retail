const THAI_NATIONAL_ID_LENGTH = 13;

/** Keep only the 13 numeric characters that make up a Thai national ID. */
export function normalizeThaiNationalId(value: string) {
  return value.replace(/\D/g, '').slice(0, THAI_NATIONAL_ID_LENGTH);
}

/** Display an ID in the standard 1-2345-67890-12-3 form. */
export function formatThaiNationalId(value: string) {
  const digits = normalizeThaiNationalId(value);
  const sections = [
    digits.slice(0, 1),
    digits.slice(1, 5),
    digits.slice(5, 10),
    digits.slice(10, 12),
    digits.slice(12, 13),
  ];

  return sections.filter(Boolean).join('-');
}
