/**
 * 数据源运行时：把 doc.sources[] 变成「最新一份 payload」的缓存，变化时通知求值侧。
 *
 * 三种接入形态，下游只认 sourceValues 一个结构：
 *   http   —— 按 intervalMs 轮询；失败保留 lastGood 并指数退避（一次失败不该让整场景闪默认）
 *   ws     —— WebSocket 长连；断线重连（退避）；staleMs 内没有新消息视为离线
 *   manual —— 宿主 JS 注入：dataHub.push(id, payload)（导出 HTML 的 window.twinData 走这条）
 *
 * 「在线」判定：http / ws 看最近一次成功时间是否超过 staleMs（默认 10s）；
 * manual 注入过一次就算在线（推的是静态值，不该过期）。
 *
 * 不做 Vue 响应式：payload 变化时在 poll/message 回调里同步跑求值 + 注入，
 * UI 只读 values / status 快照（在线点、错误提示）。
 *
 * store 侧的调用顺序：initEditor → dataHub.start(doc, applyBindings)；文档更换 → restart。
 */

import { pickPath } from './binding'

const MAX_BACKOFF_MS = 30000
const DEFAULT_INTERVAL_MS = 2000
const DEFAULT_STALE_MS = 10000

class DataHub {
  constructor() {
    /** @type {Map<string, {def:object, timer:number|null, backoff:number, nextTryAt:number, socket:WebSocket|null, reconnectTimer:number|null}>} */
    this._runners = new Map()
    /** sourceId → 最近一次成功拿到的 payload（绑定侧按 field 自取） */
    this.values = {}
    /** sourceId → { ok, error, at }（at 是这次数据的时间戳，用于「在线/离线」显示） */
    this.status = {}
    /** 数据变化订阅者（store 的 applyBindings / DatavEffect 的运行时覆盖都走这里） */
    this._subs = new Set()
    /** 主回调：store 的 applyBindings（start 时注册） */
    this.onTick = null
    this._doc = null
  }

  /** 按文档里的 sources 启动；重复调用先停旧的（切场景 / 改源定义时用） */
  start(doc, onTick = null) {
    this.stop()
    this._doc = doc || null
    this.onTick = onTick
    for (const def of doc?.sources || []) {
      if (!def?.id || !['http', 'ws', 'manual'].includes(def.type)) continue
      const runner = { def, timer: null, backoff: 1000, nextTryAt: 0, socket: null }
      this._runners.set(def.id, runner)
      if (def.type === 'http') {
        // 立即拉一次，失败后按 interval 自然重试（退避在 _poll 里累计）
        this._poll(runner)
        runner.timer = setInterval(
          () => this._poll(runner),
          Math.max(200, Number(def.intervalMs) || DEFAULT_INTERVAL_MS),
        )
      } else if (def.type === 'ws') {
        this._connect(runner)
      }
      // manual：没有拉取动作，等宿主 push
    }
  }

  stop() {
    for (const runner of this._runners.values()) {
      if (runner.timer) clearInterval(runner.timer)
      if (runner.reconnectTimer) clearTimeout(runner.reconnectTimer)
      if (runner.socket) {
        runner.socket.onopen = runner.socket.onmessage = runner.socket.onerror = runner.socket.onclose = null
        try {
          runner.socket.close()
        } catch {
          /* 已经关了一半的歌，忽略 */
        }
      }
    }
    this._runners.clear()
    this.onTick = null
    // values / status 保留：再次 start（同源同数据）时界面不闪回「无数据」
  }

  /**
   * 订阅数据变化（额外消费者用：特效节点的运行时覆盖等）。
   * store 的主回调不走这儿（它由 start 的 onTick 注册）。
   * @returns {() => void} 退订函数
   */
  subscribe(cb) {
    if (typeof cb !== 'function') return () => {}
    this._subs.add(cb)
    return () => this._subs.delete(cb)
  }

  /** 通知所有消费者；单个回调抛错不影响其他人（一条坏绑定不该拖垮全部） */
  _emit() {
    if (this.onTick) {
      try {
        this.onTick()
      } catch (err) {
        console.warn('[dataHub] 主回调抛错', err)
      }
    }
    for (const cb of this._subs) {
      try {
        cb()
      } catch (err) {
        console.warn('[dataHub] 订阅者回调抛错', err)
      }
    }
  }

  /** 外部注入一条数据（manual 源 / 宿主 JS / 后续复用的 ws 消息入口） */
  push(sourceId, payload) {
    if (!sourceId || payload == null) return
    this.values[sourceId] = payload
    this.status[sourceId] = { ok: true, error: '', at: Date.now() }
    this._emit()
  }

  /** 取某个源的整包 payload（调试 / 手动求值用） */
  get(sourceId) {
    return this.values[sourceId]
  }

  /** 某个源是否「在线」：manual 注入过即在线；http/ws 受 staleMs 约束 */
  online(sourceId) {
    const st = this.status[sourceId]
    if (!st || !st.ok) return false
    const def = this._runners.get(sourceId)?.def
    if (def?.type === 'manual') return true
    const stale = Number(def?.staleMs) || DEFAULT_STALE_MS
    return Date.now() - st.at <= stale
  }

  async _poll(runner) {
    const { def } = runner
    if (def.type !== 'http' || !def.url) return
    if (Date.now() < runner.nextTryAt) return // 退避中，等下一轮 interval
    try {
      const url = new URL(def.url, window.location.href)
      for (const [k, v] of Object.entries(def.params || {})) url.searchParams.set(k, v)
      const res = await fetch(url, { headers: { Accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const raw = await res.json()
      // 源级 path 预取一次，绑定里的 field 相对于这块子树再取
      this.values[def.id] = def.path ? pickPath(raw, def.path) : raw
      this.status[def.id] = { ok: true, error: '', at: Date.now() }
      runner.backoff = 1000
      this._emit()
    } catch (err) {
      runner.nextTryAt = Date.now() + runner.backoff
      runner.backoff = Math.min(MAX_BACKOFF_MS, runner.backoff * 2)
      // 保留 lastGood：values 不动，只是不再算「在线」
      const prev = this.status[def.id] || {}
      this.status[def.id] = { ok: false, error: String(err?.message || err), at: prev.at || 0 }
    }
  }

  /** WebSocket 长连：onmessage 直接走 push 同一条路（values + 状态 + onTick） */
  _connect(runner) {
    const { def } = runner
    if (def.type !== 'ws' || !def.url) return
    let socket
    try {
      socket = new WebSocket(def.url)
    } catch (err) {
      this._markWsError(runner, String(err?.message || err))
      return
    }
    runner.socket = socket
    socket.onopen = () => {
      runner.backoff = 1000
    }
    socket.onmessage = (evt) => {
      let payload = evt.data
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload)
        } catch {
          this._markWsError(runner, '消息不是 JSON，已忽略')
          return
        }
      }
      this.push(def.id, def.path ? pickPath(payload, def.path) : payload)
    }
    socket.onerror = () => this._markWsError(runner, '连接出错')
    socket.onclose = () => {
      if (!this._runners.has(def.id)) return // stop() 主动关的，不重连
      this._markWsError(runner, '连接已断开')
      this._scheduleReconnect(runner)
    }
  }

  _markWsError(runner, message) {
    const prev = this.status[runner.def.id] || {}
    this.status[runner.def.id] = { ok: false, error: message, at: prev.at || 0 }
  }

  _scheduleReconnect(runner) {
    const delay = runner.backoff
    runner.nextTryAt = Date.now() + delay
    runner.backoff = Math.min(MAX_BACKOFF_MS, runner.backoff * 2)
    runner.reconnectTimer = setTimeout(() => this._connect(runner), delay)
  }
}

export const dataHub = new DataHub()

/** dev 期手动灌数据用：dataHubPush('src_1', { value: 42 }) */
export function dataHubPush(sourceId, payload) {
  dataHub.push(sourceId, payload)
}
