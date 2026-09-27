<script setup>
/**
 * 工具栏右侧的登录态。
 *
 * 未登录 → 一个「登录」按钮；已登录 → 用户名 + 登出。
 * 不做下拉菜单：整个编辑器只有「登出」一个动作，为一项操作开菜单不值当。
 */
import { ref } from 'vue'
import { auth, logout } from '../../store/auth'
import Icon from './Icon.vue'
import LoginDialog from './LoginDialog.vue'

const loginOpen = ref(false)

function onLoggedIn() {
  loginOpen.value = false
}
</script>

<template>
  <div class="user-menu">
    <template v-if="auth.status === 'authed' && auth.user">
      <span class="who" :title="`${auth.user.username}${auth.user.role === 'admin' ? ' · 管理员' : ''}`">
        <Icon name="user" :size="13" />
        {{ auth.user.displayName || auth.user.username }}
      </span>
      <button class="tool-btn" title="退出登录" @click="logout">
        <Icon name="logOut" :size="13" />
        登出
      </button>
    </template>

    <button v-else class="tool-btn" title="登录后才能导出" @click="loginOpen = true">
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
  max-width: 160px;
  font-size: var(--fs-xs);
  color: var(--t-body);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.who .icon {
  flex-shrink: 0;
  color: var(--t-muted);
}
</style>
