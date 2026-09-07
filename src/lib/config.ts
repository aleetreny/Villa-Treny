const raw = import.meta.env.VITE_HABITAT_RUNTIME_URL?.trim() ?? '';
export const runtimeConfig = { habitatRuntimeUrl: raw };
