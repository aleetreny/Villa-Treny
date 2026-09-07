import type { CognitionJob } from '../src/contracts';

export function cognitionJob(overrides: Partial<CognitionJob> = {}): CognitionJob {
  return {
    schemaVersion: 1,
    jobId: 'habitat-canonical:alarm:1:resident:A:reflection:1',
    habitatId: 'habitat-canonical',
    origin: { kind: 'alarm', runId: 'habitat-canonical:alarm:1' },
    cause: {
      worldRevision: 0,
      simTime: { day: 100, minute: 0 },
    },
    kind: 'reflection',
    subjects: [{ kind: 'resident', id: 'A' }],
    pressure: 0.5,
    createdAtMs: 1_787_865_600_000,
    prompt: {
      system: 'Return only a compact decision object.',
      user: 'Consider the resident state supplied by the future domain adapter.',
    },
    outputContract: {
      name: 'cognition_result',
      version: 1,
      schemaHash: 'sha256:test-contract',
      jsonSchema: {
        type: 'object',
        properties: { thought: { type: 'string' } },
        required: ['thought'],
        additionalProperties: false,
      },
    },
    maxOutputTokens: 384,
    ...overrides,
  };
}
