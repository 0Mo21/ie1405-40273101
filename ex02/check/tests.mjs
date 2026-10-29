// آزمون‌های تمرین ۲. هر آزمون درخواست خام می‌فرستد و پاسخ خام را بررسی می‌کند، روی TCP یا TLS.
// این فایل عمومی است؛ آزمون‌های پنهان در grader/ جداست.
import net from 'node:net'
import tls from 'node:tls'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
export const CERT = join(here, 'cert.pem')
export const KEY = join(here, 'key.pem')
export const START = 2000000                 // موجودی اولیهٔ هر کاربر، به تومان
export const LUNCH = 150000                  // مبلغ یک ناهار در آزمون‌ها

// یک یا چند تکهٔ خام را می‌فرستد و هرچه تا بسته شدن اتصال یا پایان مهلت برسد برمی‌گرداند
export function raw(target, chunks, { wait = 700, gap = 60 } = {}) {
  const { port, tls: secure } = target
  return new Promise((resolve) => {
    const out = []
    const s = secure
      ? tls.connect({ port, host: '127.0.0.1', servername: 'localhost', rejectUnauthorized: false })
      : net.connect(port, '127.0.0.1')
    let timer
    const hard = setTimeout(() => done(), 4000)     // سروری که اتصال یا handshake را بی‌جواب می‌گذارد
    const done = () => { clearTimeout(timer); clearTimeout(hard); s.destroy(); resolve(Buffer.concat(out)) }
    s.on('data', d => out.push(d)); s.on('error', done); s.on('close', done)
    s.on(secure ? 'secureConnect' : 'connect', async () => {
      for (const c of [].concat(chunks)) { s.write(c); await new Promise(r => setTimeout(r, gap)) }
      timer = setTimeout(done, wait)
    })
  })
}

// پاسخ‌های پشت‌سرهم را با تکیه بر Content-Length از هم جدا می‌کند
export function parse(buf) {
  const res = []; let i = 0
  while (i < buf.length) {
    const end = buf.indexOf('\r\n\r\n', i); if (end < 0) break
    const head = buf.subarray(i, end).toString('latin1').split('\r\n')
    const [, code] = head[0].split(' ')
    const h = {}; const cookies = []
    for (const l of head.slice(1)) {
      const k = l.slice(0, l.indexOf(':')).trim().toLowerCase(); const v = l.slice(l.indexOf(':') + 1).trim()
      if (k === 'set-cookie') cookies.push(v); h[k] = v
    }
    const len = Number(h['content-length'] || 0)
    res.push({ status: Number(code), line: head[0], h, cookies, body: buf.subarray(end + 4, end + 4 + len) })
    i = end + 4 + len
  }
  return res
}

export const R = s => s.replace(/\n/g, '\r\n')
// یک درخواست کامل با Connection: close؛ اولین پاسخ را برمی‌گرداند
export async function req(t, method, path, { cookie, body, headers = {} } = {}) {
  const h = { Host: 'localhost', ...headers, Connection: 'close' }
  if (cookie) h.Cookie = cookie
  if (body !== undefined) { h['Content-Type'] = 'application/x-www-form-urlencoded'; h['Content-Length'] = Buffer.byteLength(body) }
  const head = `${method} ${path} HTTP/1.1\r\n${Object.entries(h).map(([k, v]) => `${k}: ${v}`).join('\r\n')}\r\n\r\n`
  const [r] = parse(await raw(t, Buffer.concat([Buffer.from(head, 'latin1'), Buffer.from(body ?? '', 'utf8')])))
  if (!r) throw new Error('پاسخی نیامد')
  r.text = r.body.toString('utf8')
  return r
}
export const sessionCookie = r => (r.cookies || []).find(c => !/max-age=0/i.test(c)) || ''
export const pair = c => c.split(';')[0].trim()                     // name=value
export const balance = t => Number((t.match(/balance=(\d+)/) || [])[1])
export const login = async (t, user = 'ali') => pair(sessionCookie(await req(t, 'POST', '/login', { body: `user=${user}` })))

const fail = why => why            // هر مقدار جز true یعنی رد، و خودش دلیل است

// گام ۱: HTTP خام (هفت آزمون)
export const step1 = [
  ['درخواست HTTP/1.1 بدون Host → 400', async t => {
    const [r] = parse(await raw(t, R('GET / HTTP/1.1\nConnection: close\n\n'))); return r?.status === 400 || fail(`کد وضعیت ${r?.status}`)
  }],
  ['GET / → 200، صفحهٔ HTML با فرم ورود و انتقال، و Content-Length درست', async t => {
    const r = await req(t, 'GET', '/')
    if (r.status !== 200) return fail(`کد وضعیت ${r.status}`)
    if (Number(r.h['content-length']) !== r.body.length) return fail(`Content-Length برابر ${r.h['content-length']} است ولی بدنه ${r.body.length} بایت`)
    if (!/text\/html/i.test(r.h['content-type'] || '')) return fail('Content-Type برابر text/html نیست')
    return (/\/login/.test(r.text) && /\/transfer/.test(r.text)) || fail('فرم /login یا /transfer در صفحه نیست')
  }],
  ['GET /hello?name=علی → «سلام علی» با طول درست به بایت', async t => {
    const r = await req(t, 'GET', '/hello?name=%D8%B9%D9%84%DB%8C')
    if (r.status !== 200) return fail(`کد وضعیت ${r.status}`)
    if (!r.text.includes('سلام علی')) return fail(`بدنه: ${r.text.trim().slice(0, 40)}`)
    if (Number(r.h['content-length']) !== r.body.length) return fail('Content-Length به بایت نیست')
    return /charset=utf-8/i.test(r.h['content-type'] || '') || fail('charset=utf-8 در Content-Type نیست')
  }],
  ['مسیر ناموجود → 404', async t => (await req(t, 'GET', '/nope')).status === 404 || fail('کد وضعیت 404 نبود')],
  ['DELETE / → 405 همراه Allow', async t => {
    const r = await req(t, 'DELETE', '/'); return (r.status === 405 && /GET/.test(r.h.allow || '')) || fail(`کد وضعیت ${r.status}، Allow: ${r.h.allow}`)
  }],
  ['POST /echo → همان بدنه، دقیقاً به اندازهٔ Content-Length', async t => {
    const [r] = parse(await raw(t, R('POST /echo HTTP/1.1\nHost: localhost\nContent-Length: 5\nConnection: close\n\n') + 'hello'))
    return (r?.status === 200 && r.body.toString() === 'hello') || fail(`کد وضعیت ${r?.status}`)
  }],
  ['دو درخواست پشت‌سرهم روی یک اتصال → دو پاسخ به همان ترتیب', async t => {
    const rs = parse(await raw(t, R('GET /nope HTTP/1.1\nHost: localhost\n\nGET / HTTP/1.1\nHost: localhost\nConnection: close\n\n')))
    return (rs.length === 2 && rs[0].status === 404 && rs[1].status === 200) || fail(`${rs.length} پاسخ: ${rs.map(r => r.status).join(' و ')}`)
  }],
]

// گام ۲: نشست با کوکی (شش آزمون). آزمون‌ها پشت‌سرهم‌اند و یک نشست را به هم می‌دهند.
export function step2() {
  let c1 = ''
  return [
    ['GET /me بدون کوکی → 401', async t => (await req(t, 'GET', '/me')).status === 401 || fail('کد وضعیت 401 نبود')],
    ['POST /login → Set-Cookie با Path=/ و HttpOnly و SameSite=Lax', async t => {
      const r = await req(t, 'POST', '/login', { body: 'user=ali' }); const c = sessionCookie(r); c1 = pair(c)
      if (![200, 303].includes(r.status)) return fail(`کد وضعیت ${r.status}`)
      if (!c) return fail('Set-Cookie نیامد')
      if (!/;\s*path=\/(;|$)/i.test(c)) return fail('Path=/ ندارد')
      if (!/;\s*httponly/i.test(c)) return fail('HttpOnly ندارد')
      return /;\s*samesite=lax/i.test(c) || fail(`بدون متغیر SAMESITE باید SameSite=Lax باشد: ${c}`)
    }],
    ['شناسهٔ نشست تصادفی و بلند است', async t => {
      const v = c1.slice(c1.indexOf('=') + 1)
      if (!v) return fail('کوکی نشست نیست')
      if (/ali/i.test(v)) return fail('نام کاربر در شناسه است')
      const again = await login(t)
      if (again === c1) return fail('دو ورود یک شناسه گرفتند')
      return v.length >= 22 || fail(`طول شناسه ${v.length}؛ ۱۶ بایت تصادفی دست‌کم ۲۲ نویسه است`)
    }],
    [`GET /me با کوکی → 200 و user=ali balance=${START}`, async t => {
      const r = await req(t, 'GET', '/me', { cookie: c1 })
      return (r.status === 200 && /user=ali/.test(r.text) && balance(r.text) === START) || fail(`${r.status} ${r.text.trim()}`)
    }],
    ['POST /transfer: بدون کوکی 401؛ با کوکی 200 و موجودی کم می‌شود', async t => {
      const no = await req(t, 'POST', '/transfer', { body: `to=buffet&amount=${LUNCH}` })
      if (no.status !== 401) return fail(`بدون کوکی کد وضعیت ${no.status}`)
      const r = await req(t, 'POST', '/transfer', { cookie: c1, body: `to=buffet&amount=${LUNCH}` })
      const me = await req(t, 'GET', '/me', { cookie: c1 })
      return (r.status === 200 && balance(me.text) === START - LUNCH) || fail(`${r.status}؛ موجودی ${balance(me.text)}`)
    }],
    ['POST /logout → همان کوکی دیگر کار نمی‌کند', async t => {
      await req(t, 'POST', '/logout', { cookie: c1 })
      return (await req(t, 'GET', '/me', { cookie: c1 })).status === 401 || fail('بعد از خروج هنوز 200 می‌دهد؛ نشست در سرور پاک نشده')
    }],
  ]
}

// چالش (چهار آزمون)
export const challenge = [
  ['چالش: Content-Length و Transfer-Encoding با هم → 400', async t => {
    const [r] = parse(await raw(t, R('POST /echo HTTP/1.1\nHost: localhost\nContent-Length: 4\nTransfer-Encoding: chunked\n\n0\n\n'))); return r?.status === 400 || fail(`کد وضعیت ${r?.status}`)
  }],
  ['چالش: دو Content-Length متفاوت → 400', async t => {
    const [r] = parse(await raw(t, R('POST /echo HTTP/1.1\nHost: localhost\nContent-Length: 3\nContent-Length: 5\n\nhello'))); return r?.status === 400 || fail(`کد وضعیت ${r?.status}`)
  }],
  ['چالش: انتقال با Sec-Fetch-Site: same-site → 403 و موجودی دست‌نخورده', async t => {
    const c = await login(t, 'sara')
    const r = await req(t, 'POST', '/transfer', { cookie: c, headers: { 'Sec-Fetch-Site': 'same-site', Origin: 'http://localhost:9000' }, body: `to=mallory&amount=${LUNCH}` })
    const me = await req(t, 'GET', '/me', { cookie: c })
    return (r.status === 403 && balance(me.text) === START) || fail(`${r.status}؛ موجودی ${balance(me.text)}`)
  }],
  ['چالش: cross-site → 403، ولی same-origin → 200', async t => {
    const c = await login(t, 'nima')
    const x = await req(t, 'POST', '/transfer', { cookie: c, headers: { 'Sec-Fetch-Site': 'cross-site', Origin: 'http://127.0.0.1:9000' }, body: `to=mallory&amount=${LUNCH}` })
    if (x.status !== 403) return fail(`cross-site: کد وضعیت ${x.status}`)
    const s = await req(t, 'POST', '/transfer', { cookie: c, headers: { 'Sec-Fetch-Site': 'same-origin', Origin: 'http://localhost:8000' }, body: `to=buffet&amount=${LUNCH}` })
    return s.status === 200 || fail(`same-origin: کد وضعیت ${s.status}`)
  }],
]

export async function run(t, list, { quiet = false, title } = {}) {
  const results = []
  if (!quiet && title) console.log(`\n${title}`)
  for (const [name, fn] of list) {
    let pass = false, why = ''
    try { const r = await fn(t); pass = r === true; why = pass ? '' : String(r) } catch (e) { why = e.message }
    results.push({ name, pass, why })
    if (!quiet) console.log(`${pass ? '✓' : '✗'} ${name}${pass ? '' : `   ← ${why}`}`)
  }
  return results
}

// سرور دانشجو را از پوشهٔ dir اجرا می‌کند و تا آماده شدن پورت صبر می‌کند
export async function startServer(dir, port, { tls: secure = false, env = {} } = {}) {
  const py = existsSync(join(dir, 'server.py')), js = existsSync(join(dir, 'server.mjs'))
  if (!py && !js) throw new Error('server.py یا server.mjs در این پوشه نیست')
  const args = [js ? 'server.mjs' : 'server.py', String(port), ...(secure ? ['--tls'] : [])]
  const bin = js ? process.execPath : (process.platform === 'win32' ? 'python' : 'python3')
  const e = { ...process.env, ...env, TLS_CERT: CERT, TLS_KEY: KEY }
  if (!env.SAMESITE) delete e.SAMESITE        // آزمون‌ها مقدار پیش‌فرض (Lax) را می‌سنجند
  const child = spawn(bin, args, { cwd: dir, stdio: 'ignore', env: e })
  for (let i = 0; i < 50; i++) {
    const up = await new Promise(r => { const s = net.connect(port, '127.0.0.1'); s.on('connect', () => { s.destroy(); r(true) }); s.on('error', () => r(false)) })
    if (up) break
    await new Promise(r => setTimeout(r, 100))
  }
  return child
}

const share = rs => rs.length ? rs.filter(r => r.pass).length / rs.length : 0
const round = x => Math.round(x * 100) / 100
// ردیف‌های نمره از نتیجهٔ آزمون‌های عمومی
export function publicRows({ s1, s2, s3, ch }) {
  return [
    { key: 'step1', label: 'گام ۱: HTTP خام (هفت آزمون)', score: round(2.5 * share(s1)), max: 2.5 },
    { key: 'step2', label: 'گام ۲: نشست با کوکی (شش آزمون)', score: round(2.5 * share(s2)), max: 2.5 },
    { key: 'step3', label: 'گام ۳: آزمون‌های گام ۱ و ۲ روی TLS', score: round(1 * share(s3)), max: 1 },
    { key: 'challenge', label: 'چالش (چهار آزمون)', score: round(1 * share(ch)), max: 1 },
  ]
}

// همهٔ آزمون‌های عمومی: یک سرور روی HTTP و یک سرور روی TLS
export async function runPublic(dir, { quiet = false, base = 20000 + Math.floor(Math.random() * 20000) } = {}) {
  const plain = { port: base, tls: false }, secure = { port: base + 1, tls: true }
  const a = await startServer(dir, plain.port)
  let s1, s2, ch, s3
  try {
    s1 = await run(plain, step1, { quiet, title: 'گام ۱: HTTP خام' })
    s2 = await run(plain, step2(), { quiet, title: 'گام ۲: نشست با کوکی' })
    ch = await run(plain, challenge, { quiet, title: 'چالش' })
  } finally { a.kill() }
  const b = await startServer(dir, secure.port, { tls: true })
  try {
    s3 = await run(secure, [...step1, ...step2()].map(([n, f]) => [`TLS: ${n}`, f]), { quiet, title: 'گام ۳: همان آزمون‌ها روی TLS' })
  } finally { b.kill() }
  return { s1, s2, s3, ch, plain }
}
