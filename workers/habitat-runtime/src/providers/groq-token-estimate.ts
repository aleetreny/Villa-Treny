import type { CognitionJob } from '../contracts';
import { GROQ_MODEL, isGroqModel } from './groq';
import { estimateTokens } from './shared';
import { tokenizeGroqOrdinary } from './groq-tokenizer';

export const GROQ_FRAMING_MARGIN = 128;

/** Exact ordinary tokens in authored components, plus an explicit provisional
 * provider-framing allowance. This is not an exact server-side prompt count.
 * Unknown models, text above 32,000 combined/24,000 component UTF-8 bytes,
 * or tokenizer failure keep the full byte allowance without truncation.
 * The historical625-token static evidence remains archived.
 */
export async function estimateGroqInputTokens(job: CognitionJob, model: string = GROQ_MODEL): Promise<number> {
  const parts = [job.prompt.system, job.prompt.user, JSON.stringify(job.outputContract.jsonSchema)];
  const fallback = () => estimateTokens(parts.join('\n'));
  if (!isGroqModel(model)) return fallback();
  const tokens = await tokenizeGroqOrdinary(parts);
  return tokens ? tokens.reduce((n, part) => n + part.length, 0) + GROQ_FRAMING_MARGIN : fallback();
}
