/** The one way a cover charge is written: "Free", "$5", "$7.50". */
export function costLabel(costCents: number): string {
  return costCents === 0 ? 'Free' : `$${(costCents / 100).toFixed(costCents % 100 === 0 ? 0 : 2)}`;
}
