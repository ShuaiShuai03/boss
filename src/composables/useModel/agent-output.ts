import { jsonSchema, Output } from 'ai'
import type { FlexibleSchema } from 'ai'

// Structured constraint is pushed to the SDK request boundary: when the model is configured as
// supporting native JSON and a schema is provided, we request a schema-validated object instead
// of unconstrained JSON syntax. Providers that ignore/only partially support this still fail
// loudly (NoObjectGeneratedError) instead of silently returning prose that only the loose text
// parser would catch.
export function createAgentOutput(
  jsonRequested: boolean,
  nativeJsonSupported?: boolean,
  schema?: FlexibleSchema<any>,
) {
  if (jsonRequested && nativeJsonSupported === true) {
    return schema ? Output.object({ schema }) : Output.json()
  }
  return Output.text()
}

export { jsonSchema }
