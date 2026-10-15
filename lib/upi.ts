// UPI deep links (R24) and UPI ID validation (R6). Quits never processes payments.
import { minorToMajorString, type Minor } from "./money";

export const UPI_ID_RE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/;

export function isValidUpiId(value: string): boolean {
  return UPI_ID_RE.test(value.trim());
}

/** UPI apps may cap single P2P payments at ₹1,00,000 (R26). */
export const UPI_SOFT_LIMIT_MINOR = 100_000_00;

export function upiNote(groupName: string): string {
  return `Quits: ${groupName}`.slice(0, 50);
}

/**
 * upi://pay?pa={vpa}&pn={name}&am={rupees, 2 decimals}&cu=INR&tn={note}
 * pn and tn use encodeURIComponent; '@' in pa stays literal (SPEC §4.3).
 */
export function buildUpiLink(params: {
  pa: string;
  pn: string;
  amountMinor: Minor;
  groupName: string;
}): string {
  const pa = encodeURIComponent(params.pa.trim()).replace(/%40/g, "@");
  const pn = encodeURIComponent(params.pn);
  const am = minorToMajorString(params.amountMinor, 2);
  const tn = encodeURIComponent(upiNote(params.groupName));
  return `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR&tn=${tn}`;
}
