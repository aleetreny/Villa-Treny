// Native sampling of already enlarged source compositions. Every surviving
// output pixel is copied verbatim from its own source block; no new colour,
// object, edge or interpolated sample is generated here.

/** Choose an actual source pixel minimizing the sum of RGBA L1 distances.
 * The nearest central pixel wins ties, keeping already crisp blocks stable.
 * This pure function is also used by the offline pixel-provenance checks. */
export function nativeMedoid(data, width, height, factor) {
  if (![3, 4].includes(factor) || width % factor || height % factor
    || data.length !== width * height * 4) {
    throw new Error('Native medoid requires complete 3× or 4× source blocks.');
  }
  const outputWidth = width / factor, outputHeight = height / factor;
  const output = new Uint8ClampedArray(outputWidth * outputHeight * 4);
  const origins = new Uint32Array(outputWidth * outputHeight);
  const samples = factor * factor;
  const offsets = new Int32Array(samples);
  const centres = new Float64Array(samples);
  for (let y = 0; y < factor; y++) for (let x = 0; x < factor; x++) {
    const index = y * factor + x;
    offsets[index] = (y * width + x) * 4;
    centres[index] = (x - (factor - 1) / 2) ** 2 + (y - (factor - 1) / 2) ** 2;
  }
  for (let y = 0; y < outputHeight; y++) for (let x = 0; x < outputWidth; x++) {
    const sourceStart = (y * factor * width + x * factor) * 4;
    let chosen = sourceStart, bestScore = Infinity, bestCentre = Infinity;
    for (let candidate = 0; candidate < samples; candidate++) {
      const a = sourceStart + offsets[candidate];
      let score = 0;
      for (let sample = 0; sample < samples; sample++) {
        const b = sourceStart + offsets[sample];
        score += Math.abs(data[a] - data[b]) + Math.abs(data[a + 1] - data[b + 1])
          + Math.abs(data[a + 2] - data[b + 2]) + Math.abs(data[a + 3] - data[b + 3]);
      }
      if (score < bestScore || score === bestScore && centres[candidate] < bestCentre) {
        chosen = a; bestScore = score; bestCentre = centres[candidate];
      }
    }
    const destination = (y * outputWidth + x) * 4;
    output.set(data.subarray(chosen, chosen + 4), destination);
    origins[y * outputWidth + x] = chosen / 4;
  }
  return { data: output, width: outputWidth, height: outputHeight, origins };
}

/** Opt in only for a reviewed, demonstrably improved source (see art audit).
 * Other ratios use ordinary nearest-neighbour copying without any processing. */
export function cropNative(g, source, sourceRect, destinationRect) {
  const [sx, sy, sw, sh] = sourceRect;
  const [dx, dy, dw, dh] = destinationRect;
  const factor = sw / dw;
  g.imageSmoothingEnabled = false;
  if (![3, 4].includes(factor) || sh / dh !== factor
    || ![sx, sy, sw, sh, dx, dy, dw, dh].every(Number.isInteger)) {
    g.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
    return { method: 'nearest', pixels: dw * dh };
  }
  const scratch = document.createElement('canvas');
  scratch.width = sw; scratch.height = sh;
  const context = scratch.getContext('2d', { willReadFrequently: true });
  context.imageSmoothingEnabled = false;
  context.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  const original = context.getImageData(0, 0, sw, sh);
  const sampled = nativeMedoid(original.data, sw, sh, factor);
  const native = document.createElement('canvas'); native.width = dw; native.height = dh;
  const nativeContext = native.getContext('2d');
  nativeContext.putImageData(new ImageData(sampled.data, dw, dh), 0, 0);
  g.drawImage(native, dx, dy);
  return { method: 'source-pixel-medoid', pixels: dw * dh, factor };
}

/** Remove only near-white page pixels connected to the outside of the crop.
 * Dark outlines and coloured cloth/sand prevent the flood reaching objects.
 * All retained RGB values are untouched. This is an explicit source-specific
 * cleanup, not a generic mask to apply to every room or its light artwork. */
export function clearPageFringe(g, width, height, { threshold = 230, chroma = 20 } = {}) {
  const frame = g.getImageData(0, 0, width, height), pixels = frame.data;
  const seen = new Uint8Array(width * height), queue = new Uint32Array(width * height);
  let size = 0, removed = 0;
  const offer = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const at = y * width + x;
    if (seen[at]) return;
    const p = at * 4, low = Math.min(pixels[p], pixels[p + 1], pixels[p + 2]);
    const high = Math.max(pixels[p], pixels[p + 1], pixels[p + 2]);
    if (pixels[p + 3] !== 0 && (low < threshold || high - low > chroma)) return;
    seen[at] = 1; queue[size++] = at;
  };
  for (let x = 0; x < width; x++) { offer(x, 0); offer(x, height - 1); }
  for (let y = 0; y < height; y++) { offer(0, y); offer(width - 1, y); }
  for (let i = 0; i < size; i++) {
    const at = queue[i], x = at % width, y = Math.floor(at / width);
    if (pixels[at * 4 + 3]) { pixels[at * 4 + 3] = 0; removed++; }
    offer(x - 1, y); offer(x + 1, y); offer(x, y - 1); offer(x, y + 1);
  }
  g.putImageData(frame, 0, 0);
  return { removedPixels: removed, threshold, chroma };
}
