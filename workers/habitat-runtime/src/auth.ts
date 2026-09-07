const encoder = new TextEncoder();

async function digest(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', encoder.encode(value));
}

function constantTimeEqual(left: ArrayBuffer, right: ArrayBuffer): boolean {
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  if (a.length !== b.length) return false;

  let different = 0;
  for (let index = 0; index < a.length; index += 1) {
    different |= a[index]! ^ b[index]!;
  }
  return different === 0;
}

export async function hasValidAdminToken(request: Request, expected?: string): Promise<boolean> {
  if (!expected || expected.length < 32) return false;

  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return false;
  const supplied = authorization.slice('Bearer '.length);

  const [expectedDigest, suppliedDigest] = await Promise.all([
    digest(expected),
    digest(supplied),
  ]);
  return constantTimeEqual(expectedDigest, suppliedDigest);
}
