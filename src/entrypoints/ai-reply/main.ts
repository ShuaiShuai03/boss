import ui from '@nuxt/ui/vue-plugin'
import { createApp } from 'vue'

import '@/assets/main.css'
import AiReplyPage from './AiReplyPage.vue'

createApp(AiReplyPage).use(ui).mount('#app')
