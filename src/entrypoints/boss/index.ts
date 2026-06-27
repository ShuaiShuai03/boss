import { defineUnlistedScript } from '#imports'

import { runBossHelper } from './main'

export default defineUnlistedScript(async () => {
  await runBossHelper()
})
