/**
 * startDataBindings（data 选项的落地层）单元测试。
 * 覆盖：对象 / 同步函数 / 异步轮询 / {intervalMs,load} / 拼错源 id 告警 /
 *       取数失败保留上次并只喊一次 / stop() 停轮询。
 */
import { startDataBindings } from '../../babylon-scene-player/src/dataBinding.js'

const doc = { sources: [{ id: 'src_m', type: 'manual' }, { id: 'src_h', type: 'http' }] }
let ok = true
const check = (name, cond) => { console.log(`  ${cond ? '✓' : '✗'} ${name}`); if (!cond) ok = false }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* 1. 对象即推 */
const got = []
const push = (id, p) => got.push([id, p])
let stop = startDataBindings(doc, { src_m: { run: 1 } }, push)
check('普通对象：立即推一次', got.length === 1 && got[0][0] === 'src_m' && got[0][1].run === 1)

/* 2. 同步函数即推 */
got.length = 0
stop = startDataBindings(doc, { src_h: () => ({ temp: 42 }) }, push)
check('同步函数：立即推一次', got.length === 1 && got[0][1].temp === 42)

/* 3. 异步函数 → 轮询（注意 dataBinding 的轮询下限是 200ms，测试用 250ms） */
got.length = 0
let calls = 0
stop = startDataBindings(doc, { src_h: () => { calls += 1; return Promise.resolve({ n: calls }) } }, push, 250)
await sleep(700)
check('异步函数：轮询多次（≥3 次）', calls >= 3 && got.length === calls)
check('异步函数：值在更新', got[got.length - 1][1].n === calls)
stop()
const callsAfterStop = calls
await sleep(400)
check('stop() 之后不再轮询', calls === callsAfterStop && got.length === callsAfterStop)

/* 4. { intervalMs, load } 自定义间隔（250ms 优先于默认 5000ms） */
got.length = 0
calls = 0
stop = startDataBindings(doc, { src_h: { intervalMs: 250, load: () => { calls += 1; return Promise.resolve({ k: calls }) } } }, push, 5000)
await sleep(700)
check('自定义 intervalMs 生效（700ms 内 ≥2 次）', calls >= 2)
stop()

/* 5. 拼错源 id → 告警不推 */
got.length = 0
const warns = []
const origWarn = console.warn
console.warn = (...a) => warns.push(a.join(' '))
stop = startDataBindings(doc, { src_typo: { a: 1 } }, push)
console.warn = origWarn
check('拼错源 id：不推送 + 告警一次', got.length === 0 && warns.length === 1 && warns[0].includes('src_typo'))

/* 6. 取数失败：保留上次、只喊一次 */
got.length = 0
warns.length = 0
console.warn = (...a) => warns.push(a.join(' '))
let failFirst = true
stop = startDataBindings(doc, {
  src_h: () => (failFirst ? Promise.reject(new Error('boom')) : Promise.resolve({ ok: 1 })),
}, push, 250)
await sleep(300)
check('失败时不推送（场景不闪）', got.length === 0)
failFirst = false
await sleep(700)
check('恢复后继续推', got.length >= 2 && got[0][1].ok === 1)
console.warn = origWarn
check('连续失败只 warn 一次', warns.length === 1)
stop()

/* 7. 非对象 / null 容错 */
stop = startDataBindings(doc, null, push)
stop = startDataBindings(doc, undefined, push)
check('data 为空时安静返回停止函数', typeof stop === 'function')
stop()

console.log(ok ? '\ndata 选项 OK' : '\nFAILED')
process.exitCode = ok ? 0 : 1
