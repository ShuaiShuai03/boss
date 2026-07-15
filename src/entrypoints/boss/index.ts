import { defineUnlistedScript } from '#imports'

import { runBossHelper } from './main'

export default defineUnlistedScript({
  globalName: false,
  async main() {
    await runBossHelper()
  },
})
