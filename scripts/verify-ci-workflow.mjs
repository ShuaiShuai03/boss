import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const workflow = readFileSync(new URL('../.github/workflows/main.yml', import.meta.url), 'utf8')

// BH-CI-01: quality gates must run automatically on push/PR, not only via manual dispatch.
assert.match(workflow, /^\s*pull_request:\s*$/m)
assert.match(workflow, /^\s*push:\s*$/m)
assert.match(workflow, /^\s*workflow_dispatch:\s*$/m)

// Publishing (write-permission release job) must stay gated to a tag push or manual dispatch, so
// enabling automatic push/PR checks doesn't also start auto-publishing a release/prerelease on
// every ordinary commit.
const releaseJobMatch = workflow.match(/ {2}release:\n([\s\S]*?)(?=\n {2}\S|\n*$)/)
assert.ok(releaseJobMatch, 'release job must exist')
assert.match(releaseJobMatch[1], /if:\s*startsWith\(github\.ref, 'refs\/tags\/'\)\s*\|\|\s*github\.event_name == 'workflow_dispatch'/)

console.log('CI workflow verification passed')
