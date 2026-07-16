function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function normalizeStoredModelData<T>(
  value: unknown,
  label: string,
  normalize: (model: unknown) => T,
) {
  if (value === null) return null
  if (!Array.isArray(value)) throw new Error(`${label}不是有效数组`)
  return value.map(normalize)
}

export interface ModelMutationTransaction<T> {
  models: T[]
  mutation: (models: T[]) => void
  prepare: (models: T[]) => T[]
  persist: (models: T[]) => Promise<unknown>
  replace: (models: T[]) => void
  onSuccess: () => void
}

export async function mutateAndPersistModelData<T>({
  models,
  mutation,
  prepare,
  persist,
  replace,
  onSuccess,
}: ModelMutationTransaction<T>) {
  const working = clone(models)
  mutation(working)
  const next = prepare(working)
  await persist(next)
  replace(next)
  onSuccess()
}
