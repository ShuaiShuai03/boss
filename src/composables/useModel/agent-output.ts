import { Output } from 'ai'

export function createAgentOutput(jsonRequested: boolean, nativeJsonSupported?: boolean) {
  return jsonRequested && nativeJsonSupported === true ? Output.json() : Output.text()
}
