const PALETTE = {
  all: [229, 229, 229],
  markets: [34, 197, 94],
  world: [59, 130, 246],
  macro: [234, 179, 8],
  forex: [249, 115, 22],
  crypto: [6, 182, 212],
  finance: [34, 197, 94],
  tech: [59, 130, 246],
  central_bank: [234, 179, 8],
  regulatory: [239, 68, 68],
};

const FALLBACK = [82, 82, 82];

function toHex([r, g, b]) {
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function toRgba([r, g, b], alpha) {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getCategoryColor(category) {
  const rgb = PALETTE[String(category || '').toLowerCase()] || FALLBACK;
  return {
    text: toHex(rgb),
    border: toRgba(rgb, 0.6),
    bg: toRgba(rgb, 0.12),
    activeBg: toRgba(rgb, 0.15),
  };
}
