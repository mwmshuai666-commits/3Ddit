<script setup>
/**
 * 工具栏右侧的登录态。
 *
 * 未登录 → 一个「登录」按钮；已登录 → 用户名 + 登出。
 * 不做下拉菜单：整个编辑器只有「登出」一个动作，为一项操作开菜单不值当。
 */
import { ref, computed } from 'vue'
import { auth, logout } from '../../store/auth'
import Icon from './Icon.vue'
import LoginDialog from './LoginDialog.vue'

const loginOpen = ref(false)

/** 头像字符：优先显示名，退化到账号名，再退化到 'U' */
const initial = computed(() => {
  const name = auth.user?.displayName || auth.user?.username || ''
  return name.trim().charAt(0).toUpperCase() || 'U'
})

function onLoggedIn() {
  loginOpen.value = false
}
</script>

<template>
  <div class="user-menu">
    <template v-if="auth.status === 'authed' && auth.user">
      <span class="who" :title="`${auth.user.username}${auth.user.role === 'admin' ? ' · 管理员' : ''}`">
        <span class="avatar">{{ initial }}</span>
        <span class="who-text">{{ auth.user.displayName || auth.user.username }}</span>
        <em v-if="auth.user.role === 'admin'" class="role">管理</em>
      </span>
      <button class="tool-btn ghost" title="退出登录" @click="logout">
        <Icon name="logOut" :size="13" />
        登出
      </button>
    </template>

    <button v-else class="tool-btn glass" title="登录后才能导出" @click="loginOpen = true">
      <Icon name="logIn" :size="13" />
      登录
    </button>

    <LoginDialog :open="loginOpen" @logged-in="onLoggedIn" @close="loginOpen = false" />
  </div>
</template>

<style scoped>
.user-menu {
  display: flex;
  align-items: center;
  gap: var(--s-2);
}
.who {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  max-width: 180px;
  height: 30px;
  padding: 0 var(--s-2) 0 3px;
  font-size: var(--fs-xs);
  color: var(--t-body);
  background: var(--grad-glass);
  border: 1px solid var(--c-glass-strong);
  border-radius: var(--r-pill);
}
/* 头像：名字头一个字符 + 等级角标，没有图片也不至于光秃秃 */
.avatar {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  font-size: var(--fs-2xs);
  font-weight: 700;
  color: var(--on-accent);
  background: var(--grad-accent);
  border-radius: var(--r-pill);
}
.who-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.role {
  flex-shrink: 0;
  font-size: var(--fs-2xs);
  font-style: normal;
  padding: 1px 5px;
  border-radius: var(--r-xs);
  color: var(--accent);
  background: var(--accent-soft);
}
/* 顶栏次级按钮的统一长相：玻璃胶囊 */
.tool-btn.glass,
.tool-btn.ghost {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  height: 30px;
  padding: 0 var(--s-3);
  font-size: var(--fs-sm);
  font-family: inherit;
  color: var(--t-body);
  background: var(--grad-glass);
  border: 1px solid var(--c-glass-strong);
  border-radius: var(--r-pill);
  cursor: pointer;
  transition:
    color var(--dur) var(--ease),
    border-color var(--dur) var(--ease);
}
.tool-btn.glass:hover,
.tool-btn.ghost:hover {
  color: var(--t-strong);
  border-color: rgb(255 255 255 / 26%);
}
</style>
