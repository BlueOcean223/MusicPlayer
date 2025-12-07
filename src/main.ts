import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import './style.css'
import App from './App.vue'

// 导入 Naive UI
import naive from 'naive-ui'
// 通用字体
import 'vfonts/Lato.css'
// 等宽字体
import 'vfonts/FiraCode.css'

const pinia = createPinia()
const app = createApp(App)

// 全局错误边界 - 捕获 Vue 组件中未处理的错误
app.config.errorHandler = (err, instance, info) => {
    console.error('Vue 全局错误:', err)
    console.error('错误发生在组件:', instance?.$options?.name || 'Unknown')
    console.error('错误信息:', info)
    // 可以在这里发送错误到监控服务
}

// 全局警告处理（开发环境）
if (import.meta.env.DEV) {
    app.config.warnHandler = (msg, _instance, trace) => {
        console.warn('Vue 警告:', msg)
        if (trace) console.warn('追踪:', trace)
    }
}

app.use(pinia)
app.use(router)
app.use(naive)

app.mount('#app')
