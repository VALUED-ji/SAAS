const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function formatAlphaSequence(index: number) {
  let value = Math.max(0, Math.floor(index));
  let label = "";

  do {
    label = alphabet[value % alphabet.length] + label;
    value = Math.floor(value / alphabet.length) - 1;
  } while (value >= 0);

  return label;
}
