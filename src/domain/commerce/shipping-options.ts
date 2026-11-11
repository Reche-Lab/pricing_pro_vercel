export type StoreShippingOption = {
  id: string;
  name: string;
  priceCents: number;
  description?: string;
  transitDays?: number | null;
  quoteId?: string;
  insuranceValueCents?: number;
};

export function hasTransitEstimate(option: StoreShippingOption) {
  return typeof option.transitDays === "number" && Number.isInteger(option.transitDays) && option.transitDays >= 0 && option.transitDays <= 365;
}
export function sortShippingOptions(options: readonly StoreShippingOption[]) {
  return [...options].filter(option => option.id !== "pickup").sort((a, b) => {
    const first = hasTransitEstimate(a) ? a.transitDays! : Infinity;
    const second = hasTransitEstimate(b) ? b.transitDays! : Infinity;
    return first !== second ? first < second ? -1 : 1 : a.priceCents - b.priceCents || a.id.localeCompare(b.id);
  });
}
