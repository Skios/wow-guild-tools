// In-memory stand-in for draftStore, so conversation tests can walk several steps without a database.
export function memoryDraftStore() {
  const data = new Map<string, unknown>();
  return {
    draftStore: <T>(kind: string) => ({
      get: async (id: number) => data.get(`${kind}:${id}`) as T | undefined,
      set: async (id: number, value: T) => void data.set(`${kind}:${id}`, value),
      delete: async (id: number) => void data.delete(`${kind}:${id}`),
    }),
  };
}
