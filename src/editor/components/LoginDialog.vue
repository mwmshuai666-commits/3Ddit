<script setup>
/**
 * 登录弹窗。
 *
 * 由 ExportMenu 在「未登录就点导出」时拉起。登录成功后它 emit logged-in，
 * 由 ExportMenu 决定是关掉弹窗还是接着跑刚才那一项导出。
 */
import { ref, nextTick, watch } from 'vue'
import AppModal from './AppModal.vue'
import Icon from './Icon.vue'
import { auth, login } from '../../store/auth'

const props = defineProps({
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['logged-in', 'close'])

const username = ref('')
const password = ref('')
const usernameEl = ref(null)

// 每次打开都重置：残留上一次的错误文案和旧密码都很别扭
watch(
  () => props.open,
  async (v) => {
    if (!v) return
    username.value = ''
    password.value = ''
    auth.error = ''
    await nextTick()
    usernameEl.value?.focus()
  },
)

async function submit() {
  if (auth.submitting) return
  const ok = await login(username.value, password.value)
  if (!ok) {
    // 口令也清掉，省得用户自己手动删
    password.value = ''
    await nextTick()
    usernameEl.value?.focus()
    return
  }
  password.value = ''
  emit('logged-in')
}
</script>

<template>
  <AppModal
    :open="open"
    title="登录后导出"
    width="340px"
    :dismissable="true"
    @close="emit('close')"
  >
    <p class="lead">导出需要登录。编辑器本身不需要账号，随便用。</p>

    <form class="form" @submit.prevent="submit">
      <label class="field">
        <span>账号</span>
        <input
          ref="usernameEl"
          v-model="username"
          type="text"
          autocomplete="username"
          placeholder="admin"
          :disabled="auth.submitting"
          @keydown.enter.prevent="submit"
        />
      </label>

      <label class="field">
        <span>密码</span>
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          placeholder="••••••••"
          :disabled="auth.submitting"
          @keydown.enter.prevent="submit"
        />
      </label>

      <p v-if="auth.error" class="err">
        <Icon name="alert" :size="13" />
        {{ auth.error }}
      </p>

      <button class="btn primary" type="submit" :disabled="auth.submitting">
        <Icon name="logIn" :size="14" />
        {{ auth.submitting ? '登录中…' : '登录' }}
      </button>
    </form>
  </AppModal>
</template>

<style scoped>
.lead {
  margin: 0;
  font-size: var(--fs-xs);
  line-height: 1.6;
  color: var(--t-muted);
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
}
.field span {
  font-size: var(--fs-xs);
  color: var(--t-muted);
  padding-left: var(--s-2);
}
.field input {
  height: var(--h-btn-lg);
  padding: 0 var(--s-3);
  font-size: var(--fs-sm);
  font-family: inherit;
  color: var(--t-strong);
  background: var(--c-raised);
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-pill);
  box-sizing: border-box;
}
.field input::placeholder {
  color: var(--t-faint);
}
.field input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.err {
  display: flex;
  align-items: center;
  gap: var(--s-1);
  margin: 0;
  font-size: var(--fs-xs);
  line-height: 1.5;
  color: var(--danger);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-1);
  height: var(--h-btn-lg);
  font-size: var(--fs-sm);
  font-family: inherit;
  color: var(--t-body);
  background: var(--c-raised);
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-sm);
  cursor: pointer;
}
.btn:hover:not(:disabled) {
  background: var(--c-active);
}
.btn:disabled {
  opacity: 0.55;
  cursor: default;
}
.btn.primary {
  color: var(--on-accent);
  background: var(--grad-accent);
  border-color: transparent;
  border-radius: var(--r-pill);
  height: 34px;
  font-weight: 600;
  box-shadow: var(--glow-accent);
  transition:
    filter var(--dur) var(--ease),
    transform var(--dur) var(--ease);
}
.btn.primary:hover:not(:disabled) {
  filter: brightness(1.06);
  transform: translateY(-1px);
}
.btn.primary:active:not(:disabled) {
  transform: translateY(0) scale(0.98);
}
</style>
