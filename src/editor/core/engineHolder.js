/**
 * EditorEngine 单例持有：Vue 组件 / store 通过它拿到 Babylon 内核，
 * 避免把 Babylon 对象放进 Vue 响应式系统（会被 Proxy 化导致性能/兼容性问题）。
 */
import EditorEngine from './EditorEngine'

let _engine = null

export function createEngine(canvas, callbacks) {
  if (_engine) _engine.dispose()
  _engine = new EditorEngine(canvas, callbacks)
  return _engine
}

export function getEngine() {
  return _engine
}
