export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isCouponLookupKey(value: string): boolean {
  return isUuid(value) || /^[A-Za-z0-9_-]{24,128}$/.test(value);
}
