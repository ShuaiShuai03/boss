function jsonClone<T>(source: T): T {
  return JSON.parse(JSON.stringify(source)) as T
}

export interface ConfSavePayload<FormDataLike> {
  formData: FormDataLike
  formDataPreset: string
  formDataPresets: Array<{ label: string; value: string }>
}

export function createConfSavePayload<FormDataLike>(
  formData: FormDataLike,
  formDataPreset: string,
  formDataPresets: Array<{ label: string; value: string }>,
): ConfSavePayload<FormDataLike> {
  return {
    formData: jsonClone(formData),
    formDataPreset,
    formDataPresets: jsonClone(formDataPresets),
  }
}
export function createConfSaveItems<FormDataLike>(
  payload: ConfSavePayload<FormDataLike>,
  formDataKey: string,
  presetsKey: string,
  selectedPresetKey: string,
) {
  return [
    { key: formDataKey, value: payload.formData },
    { key: presetsKey, value: payload.formDataPresets },
    { key: selectedPresetKey, value: payload.formDataPreset },
  ]
}


export async function commitAfterPersistence(
  persist: () => Promise<unknown>,
  commit: () => void,
) {
  await persist()
  commit()
}
