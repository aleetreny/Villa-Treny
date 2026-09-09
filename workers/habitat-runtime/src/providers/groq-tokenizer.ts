import { init, Tiktoken } from 'tiktoken/lite/init';
import ranks from 'tiktoken/encoders/o200k_base';
import wasm from 'tiktoken/lite/tiktoken_bg.wasm';

export const GROQ_TOKENIZER_MAX_BYTES = 32_000;
export const GROQ_TOKENIZER_MAX_COMPONENT_BYTES = 24_000;
type OrdinaryEncoder = Pick<Tiktoken, 'encode_ordinary'>;

/** One immutable encoder per isolate. Never retain prompts or count results.
 * Initialization failures are cached until isolate replacement, preventing an
 * allocation/retry storm. No WebAssembly instance is created on module import.
 */
export function createOrdinaryTokenizer(load: () => Promise<OrdinaryEncoder>) {
  let pending: Promise<OrdinaryEncoder | null> | undefined;
  return async (parts: readonly string[]): Promise<Uint32Array[] | null> => {
    // Bound before initialization and before pathological BPE work. Do not
    // truncate a payload or imply that only its prefix will reach the provider.
    if (parts.length > 3 || parts.some(text => text.length > GROQ_TOKENIZER_MAX_COMPONENT_BYTES)) return null;
    let totalBytes = 0;
    for (const text of parts) {
      const bytes = new TextEncoder().encode(text).byteLength;
      totalBytes += bytes;
      // More combined context must not admit a larger individual BPE input.
      if (bytes > GROQ_TOKENIZER_MAX_COMPONENT_BYTES || totalBytes > GROQ_TOKENIZER_MAX_BYTES) return null;
    }
    try {
      pending ??= Promise.resolve().then(load).catch(() => null);
      const encoder = await pending;
      return encoder ? parts.map(text => encoder.encode_ordinary(text)) : null;
    } catch {
      // A tokenizer error affects accounting strategy, never world state or
      // provider control. Byte accounting remains available to the caller.
      return null;
    }
  };
}

/** o200k_harmony uses the same ranks and regex as o200k_base for ordinary
 * text. Literal Harmony delimiters must not become privileged special tokens.
 * Sources and verified rank SHA256 are recorded in the research note.
 */
export const tokenizeGroqOrdinary = createOrdinaryTokenizer(async () => {
  await init(async imports => new WebAssembly.Instance(wasm, imports));
  return new Tiktoken(ranks.bpe_ranks, {}, ranks.pat_str);
});
