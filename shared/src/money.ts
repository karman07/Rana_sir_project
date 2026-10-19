/**
 * Money is always integer minor units + ISO currency code.
 * Display only: authoritative calculations live in the backend CommissionCalculationService.
 */
export interface Money {
  amount: number; // minor units (e.g. paise, cents)
  currency: string; // ISO 4217
}

export function minorUnitDigits(currency: string): number {
  return (
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

export function formatMoney(money: Money, locale?: string): string {
  const digits = minorUnitDigits(money.currency);
  return new Intl.NumberFormat(locale, { style: 'currency', currency: money.currency }).format(
    money.amount / 10 ** digits,
  );
}

/** Best-effort currency for an ISO 3166 country code; callers fall back to the user's saved preference. */
const COUNTRY_CURRENCY: Record<string, string> = {
  IN: 'INR', US: 'USD', GB: 'GBP', AE: 'AED', CA: 'CAD', AU: 'AUD', SG: 'SGD', DE: 'EUR',
  FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', IE: 'EUR',
};
export function currencyForCountry(country?: string | null, fallback = 'USD'): string {
  return (country && COUNTRY_CURRENCY[country.toUpperCase()]) || fallback;
}

/** Whole major units/decimals typed by a user (e.g. 85000.50) -> integer minor units, rounded half-up. */
export function toMinor(major: number, currency: string): number {
  return Math.round((major + Number.EPSILON) * 10 ** minorUnitDigits(currency));
}

/** Integer minor units -> major units for form inputs. Display only. */
export function fromMinor(minor: number, currency: string): number {
  return minor / 10 ** minorUnitDigits(currency);
}

export const SUPPORTED_CURRENCIES = ['INR', 'USD', 'GBP', 'EUR', 'AED', 'SGD', 'CAD', 'AUD'] as const;
