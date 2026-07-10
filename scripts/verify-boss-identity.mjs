import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  bossProtocolUserIdToSafeNumber,
  normalizeBossOpaqueUserId,
  normalizeBossProtocolUserId,
  resolveBossUser,
  waitForBossUser,
} from '../src/utils/bossIdentity.ts'

assert.equal(normalizeBossProtocolUserId(123), '123')
assert.equal(normalizeBossProtocolUserId(' 456 '), '456')
assert.equal(normalizeBossProtocolUserId('9223372036854775807'), '9223372036854775807')
assert.equal(normalizeBossProtocolUserId('9223372036854775808'), undefined)
assert.equal(normalizeBossProtocolUserId(0), undefined)
assert.equal(normalizeBossProtocolUserId('boss-encrypted-id'), undefined)
assert.equal(normalizeBossProtocolUserId('1.5'), undefined)
assert.equal(bossProtocolUserIdToSafeNumber('456'), 456)
assert.equal(bossProtocolUserIdToSafeNumber('9007199254740992'), undefined)
assert.equal(bossProtocolUserIdToSafeNumber('boss-encrypted-id'), undefined)
assert.equal(normalizeBossOpaqueUserId(' encrypted-id '), 'encrypted-id')
assert.equal(normalizeBossOpaqueUserId('  '), undefined)
assert.equal(normalizeBossOpaqueUserId(123), undefined)

assert.deepEqual(resolveBossUser({ userId: 123, showName: '求职者' }), {
  accountId: '123',
  protocolUserId: '123',
  encryptedUserId: undefined,
  name: '求职者',
  avatar: '',
})

assert.deepEqual(
  resolveBossUser(
    { uid: '456' },
    {
      encryptUserId: 'geek-encrypted-id',
      name: '备用名称',
      tinyAvatar: 'https://example.com/avatar.png',
    },
  ),
  {
    accountId: 'geek-encrypted-id',
    protocolUserId: '456',
    encryptedUserId: 'geek-encrypted-id',
    name: '备用名称',
    avatar: 'https://example.com/avatar.png',
  },
)

assert.deepEqual(resolveBossUser({ uid: 'invalid', encryptUserId: 'encrypted-only' }), {
  accountId: 'encrypted-only',
  protocolUserId: undefined,
  encryptedUserId: 'encrypted-only',
  name: '',
  avatar: '',
})

let delayedSource = { encryptUserId: 'encrypted-only' }
setTimeout(() => {
  delayedSource = { ...delayedSource, userId: 789 }
}, 5)

const delayedUser = await waitForBossUser(() => [delayedSource], {
  intervalMs: 1,
  timeoutMs: 100,
  requireProtocolUserId: true,
})
assert.equal(delayedUser.accountId, 'encrypted-only')
assert.equal(delayedUser.protocolUserId, '789')

const bossMain = readFileSync(new URL('../src/entrypoints/boss/main.ts', import.meta.url), 'utf8')
assert.doesNotMatch(bossMain, /return window\._PAGE\.encryptUserId/)
assert.match(bossMain, /async start\(\) \{\s+if \(!this\.uid \|\| !this\.protocolUserId\)/)

const bossRequests = readFileSync(
  new URL('../src/entrypoints/boss/requests.ts', import.meta.url),
  'utf8',
)
assert.match(bossRequests, /normalizeBossProtocolUserId\(res\.zpData\?\.data\?\.bossId\)/)
assert.match(bossRequests, /normalizeBossOpaqueUserId\(res\.zpData\?\.data\?\.encryptBossId\)/)

const protobuf = readFileSync(
  new URL('../src/composables/useWebSocket/protobuf.ts', import.meta.url),
  'utf8',
)
assert.match(protobuf, /normalizeBossProtocolUserId\(args\.form_uid\)/)
assert.match(protobuf, /normalizeBossProtocolUserId\(args\.to_uid\)/)

console.log('boss identity verification passed')
