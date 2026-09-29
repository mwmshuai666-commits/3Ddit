/**
 * 测试数据服务器（数据接入联调用）—— 零依赖，node 直接跑。
 *
 *   node scripts/mock-data-server.mjs                 # 默认 8601
 *   node scripts/mock-data-server.mjs --port 9001 --interval 500
 *
 * 一条链路两种协议，loadDocument 侧的 sources 任选其一：
 *   ws   源：URL 填 ws://localhost:8601        （任意路径都行，握手成功就推数据）
 *   http  源：URL 填 http://localhost:8601/api/realtime（轮询取当前值）
 *
 * 推送的数据形状（绑定弹窗里「取值路径」用 value / dir）：
 *   { value: 0~100, dir: 1|-1, ts: ... }
 *     value —— 正弦缓扫，每轮都会穿过 0 附近（低于 5 可触发显隐绑定）
 *              和 60 / 85 两档（对应阈值黄 / 红），颜色阶梯全段都能看到
 *     dir   —— 每半个周期翻一次符号，绑 direction 会看到流动方向周期性反向
 *
 * 改数据形状 / 范围改 snapshot() 一处即可。
 */

import { createServer } from 'node:http'
import { createHash } from 'node:crypto'

/* ---------------- 参数 ---------------- */

function flag(name, dflt) {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt
}
const PORT = Number(flag('port', '8601'))
const INTERVAL = Number(flag('interval', '1000'))

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

/* ---------------- 数据 ---------------- */

const startedAt = Date.now()

/** 当前数据快照：正弦扫值 + 周期翻向，一条曲线覆盖所有绑定场景 */
function snapshot() {
  const t = (Date.now() - startedAt) / 1000
  const phase = t / 6 // 约 38s 一个完整周期：0 → 100 → 0
  const value = Math.round(50 + 50 * Math.sin(phase))
  const dir = Math.cos(phase) >= 0 ? 1 : -1
  return { value, dir, ts: Date.now() }
}

/* ---------------- WebSocket 帧（最小实现） ---------------- */

/** 服务端 → 客户端帧（不掩码）。opcode 0x81 文本 / 0x8A pong */
function encodeFrame(payload, opcode = 0x81) {
  const body = Buffer.from(payload, 'utf8')
  const len = body.length
  let header
  if (len < 126) {
    header = Buffer.alloc(2)
    header[1] = len
  } else if (len < 65536) {
    header = Buffer.alloc(4)
    header[1] = 126
    header.writeUInt16BE(len, 2)
  } else {
    header = Buffer.alloc(10)
    header[1] = 127
    header.writeBigUInt64BE(BigInt(len), 2)
  }
  header[0] = 0x80 | opcode // FIN=1
  return Buffer.concat([header, body])
}

/** 拆分已缓冲的字节为完整帧（客户端帧必须掩码，这里负责解开） */
function decodeFrames(buffer) {
  const frames = []
  let offset = 0
  while (offset + 2 <= buffer.length) {
    const opcode = buffer[offset] & 0x0f
    const masked = (buffer[offset + 1] & 0x80) !== 0
    let len = buffer[offset + 1] & 0x7f
    let p = offset + 2
    if (len === 126) {
      if (buffer.length < p + 2) break
      len = buffer.readUInt16BE(p)
      p += 2
    } else if (len === 127) {
      if (buffer.length < p + 8) break
      len = Number(buffer.readBigUInt64BE(p))
      p += 8
    }
    let mask = null
    if (masked) {
      if (buffer.length < p + 4) break
      mask = buffer.subarray(p, p + 4)
      p += 4
    }
    if (buffer.length < p + len) break
    const payload = Buffer.from(buffer.subarray(p, p + len))
    if (mask) for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4]
    frames.push({ opcode, payload })
    offset = p + len
  }
  return { frames, rest: buffer.subarray(offset) }
}

/* ---------------- 服务 ---------------- */

const clients = new Set()

const server = createServer((req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  }
  const url = new URL(req.url || '/', 'http://localhost')
  if (url.pathname === '/api/realtime') {
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(snapshot()))
    return
  }
  res.writeHead(200, { ...cors, 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('mock-data-server：GET /api/realtime 取当前值；WS 连任意路径推实时数据\n')
})

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key']
  if (!key) {
    socket.destroy()
    return
  }
  const accept = createHash('sha1').update(key + WS_GUID).digest('base64')
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n'
    + 'Upgrade: websocket\r\n'
    + 'Connection: Upgrade\r\n'
    + `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  )
  socket.buffer = Buffer.alloc(0)
  clients.add(socket)

  socket.on('data', (chunk) => {
    socket.buffer = Buffer.concat([socket.buffer, chunk])
    const { frames, rest } = decodeFrames(socket.buffer)
    socket.buffer = rest
    for (const f of frames) {
      if (f.opcode === 0x8) {
        // 客户端关闭
        socket.end()
      } else if (f.opcode === 0x9) {
        socket.write(encodeFrame(f.payload, 0x8a)) // ping → pong
      }
    }
  })
  const drop = () => clients.delete(socket)
  socket.on('close', drop)
  socket.on('error', drop)
})

server.listen(PORT, () => {
  console.log(`测试数据服务器已启动（${INTERVAL}ms 一推）`)
  console.log(`  WS   源：ws://localhost:${PORT}          （绑定弹窗：类型选 WebSocket，取值路径 value）`)
  console.log(`  HTTP  源：http://localhost:${PORT}/api/realtime（类型选 http 轮询，取值路径 value）`)
  console.log('  dir 字段同理，绑 direction 看流向周期性反向；value<5 时显隐绑定会隐藏')
  console.log('   Ctrl+C 停止\n')
})

setInterval(() => {
  if (!clients.size) return
  const text = JSON.stringify(snapshot())
  const frame = encodeFrame(text)
  for (const socket of clients) {
    try {
      socket.write(frame)
    } catch {
      clients.delete(socket)
    }
  }
  console.log(`[push] ${text}   (ws 客户端 ${clients.size} 个)`)
}, INTERVAL)
