/**
 * 登录态。刻意不引 pinia —— 一个 reactive 对象 + 几个方法就够，
 * 为了它往项目里加一个状态管理库不划算。
 *
 * 只有「导出」需要登录，编辑器其余功能（摆放模型、保存、新建）一律不拦，
 * 所以这里的状态只被工具栏、导出菜单、登录弹窗三处消费。
 */
import { reactive } from 'vue'
import { setUnauthorizedHandler } from '../api/http'
import * as authApi from '../api/auth'
import { UnauthorizedError } from '../api/http'

/** localStorage 的键。存的是明文令牌（Authorization: Bearer 就得用它） */
const TOKEN_KEY = 'babylon-scene-editor:token'

/**
 * status 四态：
 *   idle    还没 bootstrap
 *   probe   启动时正在问后端「这个 token 还有效吗」
 *   authed  已登录
 *   anon    未登录 / 登录已失效
 */
export const auth = reactive({
  status: 'idle',
  user: null,
  /** 本次启动是否问过后端了——用来避免没登录时反复弹窗打扰 */
  probed: false,
  /** 登录中的错误文案，LoginDialog 直接读 */
  error: '',
  /** 登录请求进行中（防止连点） */
  submitting: false,
})

export const isAuthed = () => auth.status === 'authed'

export const token = () => {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    // 隐私模式下 localStorage 会抛异常，当成未登录处理
    return ''
  }
}

function saveToken(t) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* 存不进去也无妨，只是刷新页面后要重新登录 */
  }
}

/** 清成本地未登录态。不调后端——401 时后端会话可能已经不可用了 */
function clearLocal() {
  saveToken('')
  auth.user = null
  auth.status = 'anon'
}

// http 层遇到 401 就自动落到这里，省得每个调用点各自 catch
setUnauthorizedHandler(clearLocal)

/**
 * 启动时试探登录态。
 * 令牌失效、后端没起来都当场降级成未登录，不阻塞编辑器渲染。
 */
export async function bootstrap() {
  const saved = token()
  if (!saved) {
    auth.status = 'anon'
    auth.probed = true
    return
  }
  auth.status = 'probe'
  try {
    auth.user = await authApi.me(saved)
    auth.status = 'authed'
  } catch {
    clearLocal()
  } finally {
    auth.probed = true
  }
}

/**
 * 登录。失败时错误写在 auth.error 上（而不是 throw），
 * 因为唯一的调用方是表单，它要的是「显示在输入框下面」。
 */
export async function login(username, password) {
  auth.submitting = true
  auth.error = ''
  try {
    const result = await authApi.login(username.trim(), password)
    saveToken(result.token)
    auth.user = result.user
    auth.status = 'authed'
    return true
  } catch (err) {
    auth.error =
      err instanceof UnauthorizedError ? err.message : err?.message || '登录失败，请重试'
    return false
  } finally {
    auth.submitting = false
  }
}

export async function logout() {
  const current = token()
  try {
    if (current) await authApi.logout(current)
  } catch {
    // 登出失败也照样清本地：本地这个令牌对用户已经没有意义了
  }
  clearLocal()
}
