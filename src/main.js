import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { bootstrap } from './store/auth'

// 先试探登录态再挂载：工具栏和导出菜单一上来就要按「有没有登录」渲染，
// 不先问好的话会先闪一下未登录态再跳成已登录。
// 后端没起来也不卡——bootstrap 内部把失败降级成未登录。
await bootstrap()

createApp(App).mount('#app')
