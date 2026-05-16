import type { CurrencyCode, DecimalString, Money } from '../types';

const SCALE = 4n;
const FACTOR = 10_000n;

export function decimalToUnits(value: DecimalString | number | undefined): bigint {
  if (value === undefined) return 0n;
  const normalized = String(value).trim();
  if (!normalized) return 0n;
  const negative = normalized.startsWith('-');
  const unsigned = negative ? normalized.slice(1) : normalized;
  if (!/^(?:\d+|\d*\.\d+)$/.test(unsigned)) return 0n;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  const fractionUnits = (fraction + '0'.repeat(Number(SCALE))).slice(0, Number(SCALE));
  const units = BigInt(whole || '0') * FACTOR + BigInt(fractionUnits || '0');
  return negative ? -units : units;
}

export function unitsToDecimal(units: bigint, decimals = 2): DecimalString {
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  const whole = absolute / FACTOR;
  const fraction = (absolute % FACTOR).toString().padStart(Number(SCALE), '0').slice(0, decimals);
  return `${negative ? '-' : ''}${whole.toString()}${decimals > 0 ? `.${fraction}` : ''}`;
}

export function money(amount: DecimalString | number, currency: CurrencyCode): Money {
  return { amount: unitsToDecimal(decimalToUnits(amount), 4), currency };
}

export function normalizeDecimalInput(value: string, options: { allowZero?: boolean } = {}): DecimalString | undefined {
  const normalized = value.trim();
  if (!/^(?:\d+|\d*\.\d+)$/.test(normalized)) return undefined;
  const units = decimalToUnits(normalized);
  if (units < 0n) return undefined;
  if (!options.allowZero && units === 0n) return undefined;
  return unitsToDecimal(units, 4);
}

export function addMoney(values: Money[], currency: CurrencyCode): Money {
  const total = values.reduce((sum, item) => sum + decimalToUnits(item.amount), 0n);
  return { amount: unitsToDecimal(total, 4), currency };
}

export function negateMoney(value: Money): Money {
  return { ...value, amount: unitsToDecimal(-decimalToUnits(value.amount), 4) };
}

export function multiplyMoney(value: Money, multiplier: DecimalString | number): Money {
  const result = (decimalToUnits(value.amount) * decimalToUnits(multiplier)) / FACTOR;
  return { amount: unitsToDecimal(result, 4), currency: value.currency };
}

export function divideMoney(value: Money, divisor: DecimalString | number): Money {
  const divisorUnits = decimalToUnits(divisor);
  if (divisorUnits === 0n) return { amount: '0.0000', currency: value.currency };
  const result = (decimalToUnits(value.amount) * FACTOR) / divisorUnits;
  return { amount: unitsToDecimal(result, 4), currency: value.currency };
}

export function convertMoney(value: Money, targetCurrency: CurrencyCode, rate?: DecimalString): Money {
  if (value.currency === targetCurrency) return { amount: value.amount, currency: targetCurrency };
  if (!rate) return { amount: value.amount, currency: targetCurrency };
  return { ...multiplyMoney(value, rate), currency: targetCurrency };
}

export function compareMoney(a: Money, b: Money): number {
  const left = decimalToUnits(a.amount);
  const right = decimalToUnits(b.amount);
  if (left === right) return 0;
  return left > right ? 1 : -1;
}

export function moneyToNumber(value: Money): number {
  return Number(value.amount);
}

export function formatMoney(value: Money, hide = false): string {
  if (hide) return '****';
  const symbols: Record<string, string> = {
    CNY: '¥',
    USD: '$',
    HKD: 'HK$',
    EUR: '€',
    JPY: '¥'
  };
  const numeric = Number(value.amount || 0).toFixed(2);
  const [whole, fraction] = numeric.split('.');
  const formattedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${symbols[value.currency] || `${value.currency} `}${formattedWhole}.${fraction}`;
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
