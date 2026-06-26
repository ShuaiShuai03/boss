import assert from 'node:assert/strict'

import { defaultFormData } from '../src/composables/conf/info.ts'

function promptText(key) {
  return defaultFormData[key].prompt.map((item) => item.content).join('\n')
}

const greeting = promptText('aiGreeting')
assert.match(greeting, /\[求职者姓名\]/)
assert.match(greeting, /\[目标岗位方向 1\]/)
assert.match(greeting, /只输出一条招呼语/)

const filtering = promptText('aiFiltering')
assert.match(filtering, /\[求职者姓名\]/)
assert.match(filtering, /\[不想投递的岗位类型\]/)
assert.match(filtering, /岗位匹配评审/)
assert.match(filtering, /最终只返回下面格式的 JSON/)

const reply = promptText('aiReply')
assert.match(reply, /\[求职者姓名\]/)
assert.match(reply, /\[地点\/薪资\/面试偏好\]/)
assert.match(reply, /HR 消息/)
assert.match(reply, /只输出可以直接发送/)

console.log('prompt defaults verification passed')
