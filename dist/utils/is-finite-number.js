export function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export default isFiniteNumber;
