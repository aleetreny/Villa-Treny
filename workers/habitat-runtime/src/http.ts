const MAX_JSON_BODY_BYTES = 64 * 1024;
const encoder = new TextEncoder();

export function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  return Response.json(value, { ...init, headers });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
): Response {
  return jsonResponse({ error: { code, message } }, { status });
}

export async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new TypeError('content-type must be application/json');
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
    throw new TypeError('request body is too large');
  }

  const body = await request.text();
  if (encoder.encode(body).byteLength > MAX_JSON_BODY_BYTES) {
    throw new TypeError('request body is too large');
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new TypeError('request body must be valid JSON');
  }
}
