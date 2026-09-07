/** Weak comparison is appropriate for a GET representation's If-None-Match. */
export function matchesEntityTag(header: string | null, tag: string): boolean {
  if (!header) return false;
  return header.split(',').some((part) => {
    const candidate = part.trim();
    return candidate === '*' || candidate.replace(/^W\//, '') === tag;
  });
}
