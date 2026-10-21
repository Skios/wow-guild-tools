import { vi, type Mock } from 'vitest';

type Method = 'findUnique' | 'findFirst' | 'findMany' | 'create' | 'update' | 'updateMany' | 'upsert' | 'delete' | 'deleteMany' | 'count';
type ModelMock = Record<Method, Mock>;
type ModelName = 'user' | 'identity' | 'character' | 'event' | 'response' | 'rosterGroup' | 'groupMember' | 'chatDraft';

const models = new Map<string, ModelMock>();
const registry = new Map<string, Record<string, Mock>>();
const transaction = vi.fn();

function model(name: string): ModelMock {
  let existing = models.get(name);
  if (!existing) {
    const methods = {} as Record<string, Mock>;
    existing = new Proxy(methods as ModelMock, {
      get: (_target, method: string) => (methods[method] ??= vi.fn()),
    });
    models.set(name, existing);
    registry.set(name, methods);
  }
  return existing;
}

/** Stand-in for the Prisma client: any `prismaMock.<model>.<method>` is a vi.fn(). */
export const prismaMock = new Proxy({} as Record<ModelName, ModelMock> & { $transaction: Mock }, {
  get: (_target, key: string) => (key === '$transaction' ? transaction : model(key)),
});

/** Clears every mock and restores the default $transaction behaviour. */
export function resetPrismaMock() {
  for (const methods of registry.values()) for (const fn of Object.values(methods)) fn.mockReset();
  transaction.mockReset();
  transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === 'function' ? arg(prismaMock) : Promise.all(arg as Promise<unknown>[]),
  );
}
