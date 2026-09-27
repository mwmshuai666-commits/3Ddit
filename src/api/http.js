/**
 * fetch 薄封装。
 *
 * 刻意薄：不做拦截器链、不做全局 loading、不引 axios。整个编辑器只有
 * 登录这一件事需要联网，一个函数能覆盖就不造框架。
 *
 * 后端统一响应体是 { code, message, data }，code === 0 才算成功。
 */

const BASE = import.meta.env.VITE_API_BASE || '/api/v1'

/** 401 统一错误。调用方靠 `instanceof` 分流，不需要自己判断状态码。 */
export class UnauthorizedError extends Error {
  constructor(message = '未登录或登录已过期') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

/** 后端把错误原因放在 message 里，这类错误直接透出给用户看 */
export class ApiError extends Error {
  constructor(message, httpStatus) {
    super(message)
    this.name = 'ApiError'
    this.httpStatus = httpStatus
  }
}

/** 登出/401 时的回调，由 store/auth 注入，避免 http → store → http 循环依赖 */
let onUnauthorized = null
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn
}

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  let res
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    // fetch 只在网络层失败时 throw；连不上后端、DNS 挂了都在这里
    throw new ApiError('连接服务器失败，请确认后端已启动', 0)
  }

  // 204 没响应体；个别接口可能返回非 JSON
  if (res.status === 204) return null

  let payload = null
  const text = await res.text()
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (res.status === 401) {
    onUnauthorized?.()
    throw new UnauthorizedError(payload?.message)
  }
  if (!res.ok) {
    throw new ApiError(payload?.message || `请求失败（HTTP ${res.status}）`, res.status)
  }
  if (!payload) {
    throw new ApiError('服务器返回了无法解析的内容', res.status)
  }
  if (payload.code !== 0) {
    throw new ApiError(payload.message || `请求失败（code ${payload.code}）`, res.status)
  }
  return payload.data
}

export const http = {
  get: (path, opts) => request(path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
  put: (path, body, opts) => request(path, { ...opts, method: 'PUT', body }),
  del: (path, opts) => request(path, { ...opts, method: 'DELETE' }),
}
