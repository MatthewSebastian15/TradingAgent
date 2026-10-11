// Number(null) is 0 and 0 passes Number.isFinite, which would value a lot at zero.
// A usable price is a finite number greater than zero; anything else is "no price".
export function toPrice(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
