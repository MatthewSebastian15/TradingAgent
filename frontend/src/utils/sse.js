export function parseSseBlock(block) {
  const event = { type: 'message', data: [] };
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(':')) continue;
    const idx = line.indexOf(':');
    const field = idx === -1 ? line : line.slice(0, idx);
    const value = idx === -1 ? '' : line.slice(idx + 1).replace(/^ /, '');
    if (field === 'event') event.type = value;
    if (field === 'data') event.data.push(value);
  }
  if (!event.data.length) return null;
  try {
    return { type: event.type, payload: JSON.parse(event.data.join('\n')) };
  } catch {
    return null;
  }
}
