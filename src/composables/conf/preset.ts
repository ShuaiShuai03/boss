export interface PresetSwitchOptions<T> {
  value: string
  load: (value: string) => Promise<T>
  persistSelection: (value: string) => Promise<unknown>
}

export function formDataKeyForPreset(preset: string) {
  return preset === 'default'
    ? 'local:web-geek-job-FormData'
    : `local:web-geek-job-FormData-${preset}`
}

export async function preparePresetSwitch<T>({
  value,
  load,
  persistSelection,
}: PresetSwitchOptions<T>) {
  const data = await load(value)
  await persistSelection(value)
  return data
}
