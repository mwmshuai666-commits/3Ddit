/** 登录鉴权相关的三个接口 */
import { http } from './http'

/**
 * 登录换令牌。
 * @returns {Promise<{token:string, expiresAt:string, user:{id:number,username:string,displayName:string,role:string}}>}
 */
export function login(username, password) {
  return http.post('/auth/login', { username, password })
}

/** 用现有令牌换当前用户（启动时试探登录态用） */
export function me(token) {
  return http.get('/auth/me', { token })
}

/** 注销当前会话，服务端把这张令牌作废 */
export function logout(token) {
  return http.post('/auth/logout', undefined, { token })
}
