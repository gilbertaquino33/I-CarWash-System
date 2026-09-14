export const PH_MOBILE_DIGITS_LENGTH = 10;

export function toPHMobileInput(value: string): string {
  let digits = value.replace(/\D/g, '');

  if (digits.startsWith('63')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);

  return digits.slice(0, PH_MOBILE_DIGITS_LENGTH);
}

export function toPHMobileE164(value: string): string | null {
  const digits = toPHMobileInput(value);
  return /^9\d{9}$/.test(digits) ? `+63${digits}` : null;
}