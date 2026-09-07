/** Lossless row compression for generated collision/alpha masks. Coordinates
 * and every source bit remain unchanged; this only reduces JavaScript parsing.
 */
export function encodeBitmapRow(row: string): string {
  const runs = row.match(/(.)\1*/g) ?? [];
  const packed = '~' + runs.map((run) => `${run.length.toString(36)}:${run[0]}`).join(';');
  return packed.length < row.length ? packed : row;
}

export function decodeBitmapRow(row: string): string {
  if (!row.startsWith('~')) return row;
  let decoded = '';
  for (const run of row.slice(1).split(';')) {
    const match = /^([0-9a-z]+):([.#01])$/.exec(run);
    const count = match ? parseInt(match[1]!, 36) : 0;
    if (!match || !count || count > 4096 || decoded.length + count > 4096) throw new RangeError('Invalid generated bitmap run.');
    decoded += match[2]!.repeat(count);
  }
  return decoded;
}
