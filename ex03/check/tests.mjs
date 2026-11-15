// آزمون‌های تمرین ۳. هر آزمون یک درخواست HTTP به نشانی Worker شما می‌فرستد و پاسخ را بررسی می‌کند.
// این فایل عمومی است؛ آزمون‌های پنهان در grader/ جداست.

const T = 10000   // مهلت هر درخواست، میلی‌ثانیه

export async function hit(base, path, { method = 'GET', headers = {}, body } = {}) {
  const r = await fetch(new URL(path, base), { method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(T) })
  const text = await r.text()
  return { status: r.status, h: k => r.headers.get(k) ?? '', text }
}

// شمارهٔ دانشجویی از روی نشانی: cv.ie1405-401234567.workers.dev
export const idFromUrl = base => /^cv\.ie1405-(\d{6,12})\.workers\.dev$/i.exec(new URL(base).hostname)?.[1]

const maxAge = cc => Number(/(?:^|,)\s*max-age=(\d+)/i.exec(cc)?.[1] ?? 0)
const has = (cc, d) => cc.toLowerCase().split(',').map(s => s.trim()).includes(d)

// هر آزمون: [بخش، شرح، نمره، تابع]؛ تابع true برمی‌گرداند یا رشته‌ای که علت رد شدن را می‌گوید
export const publicTests = [
  ['متدها', 'GET / → 200 و text/html، با نام و شمارهٔ خودتان (نه متن فایل آغازین)', 0.25, async b => {
    const r = await hit(b, '/')
    if (/000000000|نام شما/.test(r.text)) return 'نام و شمارهٔ دانشجویی هنوز همان متن فایل آغازین است'
    return r.status === 200 && /text\/html/i.test(r.h('content-type')) || `status ${r.status}، Content-Type: ${r.h('content-type')}`
  }],
  ['متدها', 'HEAD /cv.json → 200 بدون بدنه، با Content-Type برابر application/json', 0.5, async b => {
    const r = await hit(b, '/cv.json', { method: 'HEAD' })
    return r.status === 200 && r.text === '' && /application\/json/i.test(r.h('content-type')) || `status ${r.status}، Content-Type: ${r.h('content-type') || '(نیست)'}`
  }],
  ['متدها', 'OPTIONS / → فیلد Allow با GET و HEAD', 0.5, async b => {
    const r = await hit(b, '/', { method: 'OPTIONS' }); const a = r.h('allow').toUpperCase()
    return r.status < 300 && /\bGET\b/.test(a) && /\bHEAD\b/.test(a) || `status ${r.status}، Allow: ${r.h('allow') || '(نیست)'}`
  }],
  ['متدها', 'POST /contact → 303 با Location به /thanks', 0.5, async b => {
    const r = await hit(b, '/contact', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'message=salam' })
    return r.status === 303 && new URL(r.h('location') || 'x:', b).pathname === '/thanks' || `status ${r.status}، Location: ${r.h('location') || '(نیست)'}`
  }],
  ['متدها', 'DELETE / → 405 با فیلد Allow', 0.5, async b => {
    const r = await hit(b, '/', { method: 'DELETE' }); const a = r.h('allow').toUpperCase()
    return r.status === 405 && /\bGET\b/.test(a) && !/\bDELETE\b/.test(a) || `status ${r.status}، Allow: ${r.h('allow') || '(نیست)'}`
  }],
  ['متدها', 'مسیر ناموجود → 404', 0.25, async b => {
    const r = await hit(b, '/no-such-page'); return r.status === 404 || `status ${r.status}`
  }],
  ['cache', 'صفحهٔ / با public و max-age و ETag', 0.5, async b => {
    const r = await hit(b, '/'); const cc = r.h('cache-control')
    return has(cc, 'public') && maxAge(cc) > 0 && !!r.h('etag') || `Cache-Control: ${cc || '(نیست)'}، ETag: ${r.h('etag') || '(نیست)'}`
  }],
  ['cache', 'GET / با If-None-Match همان ETag → 304 بدون بدنه', 0.75, async b => {
    const e = (await hit(b, '/')).h('etag'); if (!e) return 'ETag نیست'
    const r = await hit(b, '/', { headers: { 'if-none-match': e } })
    return r.status === 304 && r.text === '' || `status ${r.status}، بدنه ${r.text.length} بایت`
  }],
  ['cache', 'مسیر /cv.json: JSON معتبر با name و studentId، و public و max-age', 0.5, async b => {
    const r = await hit(b, '/cv.json'); const cc = r.h('cache-control'); let j
    try { j = JSON.parse(r.text) } catch { return `status ${r.status}، بدنه JSON معتبر نیست` }
    return !!j.name && !!j.studentId && has(cc, 'public') && maxAge(cc) > 0 || `Cache-Control: ${cc || '(نیست)'}، name/studentId: ${!!j.name}/${!!j.studentId}`
  }],
  ['cache', 'فایل css صفحه با نام دارای هش، immutable و عمر یک‌ساله', 0.5, async b => {
    const page = (await hit(b, '/')).text
    const href = /<link[^>]+href="(\/style\.[0-9a-f]{6,}\.css)"/i.exec(page)?.[1]
    if (!href) return 'صفحه به /style.<هش>.css پیوند نداده است'
    const r = await hit(b, href); const cc = r.h('cache-control')
    return r.status === 200 && has(cc, 'immutable') && maxAge(cc) >= 31536000 || `${href}: status ${r.status}، Cache-Control: ${cc || '(نیست)'}`
  }],
  ['cache', 'صفحهٔ /thanks با no-store', 0.25, async b => {
    const r = await hit(b, '/thanks'); return r.status === 200 && has(r.h('cache-control'), 'no-store') || `status ${r.status}، Cache-Control: ${r.h('cache-control') || '(نیست)'}`
  }],
  ['نشانی', 'نشانی cv.ie1405-<شماره>.workers.dev، و همان شماره در /cv.json و صفحه', 1, async b => {
    const id = idFromUrl(b)
    if (!id) return 'نشانی به شکل https://cv.ie1405-<شمارهٔ دانشجویی>.workers.dev نیست (روی localhost این آزمون نمره ندارد)'
    const j = JSON.parse((await hit(b, '/cv.json')).text || '{}'); const page = (await hit(b, '/')).text
    return String(j.studentId) === id && page.includes(id) || `شمارهٔ نشانی ${id}، studentId در cv.json: ${j.studentId}`
  }],
]

export async function run(base, tests) {
  const rows = []
  for (const [part, label, max, fn] of tests) {
    let r
    try { r = await fn(base) } catch (e) { r = `خطا: ${e.cause?.code || e.name || e.message}` }
    rows.push({ part, label, max, ok: r === true, why: r === true ? '' : String(r) })
  }
  return rows
}
