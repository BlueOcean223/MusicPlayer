import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('../views/Home.vue')
  },
  {
    path: '/now-playing',
    name: 'NowPlaying',
    component: () => import('../views/NowPlaying.vue')
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router