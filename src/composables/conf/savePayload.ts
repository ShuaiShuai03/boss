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
