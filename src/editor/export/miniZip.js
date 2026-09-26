/**
 * 迷你 ZIP 写入器（只存不压缩，store 模式）
 *
 * 为什么不用 jszip：导出「完整包」只需要把若干文件打成一个包，store 模式的 zip
 * 任何解压软件都认（Windows 资源管理器 / macOS 归档实用工具 / unzip / Python zipfile）。
 * glb 本身就是压缩过的二进制，再压一遍收益极小，所以这里不引压缩库，少一个依赖。
 *
 * 只实现打包必需的部分：本地文件头 + 中央目录 + 结尾记录，全部用 DataView 手写。
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** DOS 时间/日期：本地时区，2 秒精度 */
function dosDateTime(d = new Date()) {
  const time =
    (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f)
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time: time & 0xffff, date: date & 0xffff }
}

const encoder = new TextEncoder()

/**
 * @param {{name:string, data:Uint8Array|string}[]} files
 * @returns {Uint8Array} 完整 zip 字节
 */
export function buildZipBytes(files) {
  const { time, date } = dosDateTime()
  const parts = []
  const central = []
  let offset = 0

  for (const file of files) {
    const nameBytes = encoder.encode(file.name)
    const data = typeof file.data === 'string' ? encoder.encode(file.data) : file.data
    const crc = crc32(data)

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true) // 所需版本
    local.setUint16(6, 0x0800, true) // 位 11：文件名是 UTF-8
    local.setUint16(8, 0, true) // 存储，不压缩
    local.setUint16(10, time, true)
    local.setUint16(12, date, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, data.length, true)
    local.setUint32(22, data.length, true)
    local.setUint16(26, nameBytes.length, true)
    local.setUint16(28, 0, true) // 扩展字段长度

    parts.push(new Uint8Array(local.buffer), nameBytes, data)

    const dir = new DataView(new ArrayBuffer(46))
    dir.setUint32(0, 0x02014b50, true)
    dir.setUint16(4, 20, true) // 生成版本
    dir.setUint16(6, 20, true) // 所需版本
    dir.setUint16(8, 0x0800, true)
    dir.setUint16(10, 0, true)
    dir.setUint16(12, time, true)
    dir.setUint16(14, date, true)
    dir.setUint32(16, crc, true)
    dir.setUint32(20, data.length, true)
    dir.setUint32(24, data.length, true)
    dir.setUint16(28, nameBytes.length, true)
    dir.setUint16(30, 0, true) // extra
    dir.setUint16(32, 0, true) // comment
    dir.setUint16(34, 0, true) // 起始磁盘
    dir.setUint16(36, 0, true) // 内部属性
    dir.setUint32(38, 0o600 << 16, true) // 外部属性（Unix 权限）
    dir.setUint32(42, offset, true)
    central.push(new Uint8Array(dir.buffer), nameBytes)

    offset += 30 + nameBytes.length + data.length
  }

  const centralSize = central.reduce((n, p) => n + p.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(4, 0, true)
  end.setUint16(6, 0, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true)
  end.setUint16(20, 0, true)

  const total =
    parts.reduce((n, p) => n + p.length, 0) + centralSize + 22
  const out = new Uint8Array(total)
  let pos = 0
  for (const p of [...parts, ...central, new Uint8Array(end.buffer)]) {
    out.set(p, pos)
    pos += p.length
  }
  return out
}

/** @param {{name:string, data:Uint8Array|string}[]} files */
export function createZipBlob(files) {
  return new Blob([buildZipBytes(files)], { type: 'application/zip' })
}
