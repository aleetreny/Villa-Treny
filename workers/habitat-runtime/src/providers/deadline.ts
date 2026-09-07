/** A late provider response cannot escape this promise and become an action.
 * Dispatch may already have incurred usage, so callers retain the reservation.
 */
export async function withProviderDeadline<T>(pending: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error('Provider response deadline exceeded.');
          error.name = 'ProviderTimeout';
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
