// مشاهده: هر URL را به دو parser می‌دهد؛ parser مرورگر (new URL در Node) و curl روی سیستم خودتان.
//   node observe.mjs            هشت URL تمرین (urls.txt) ← observed.json و evidence/curl.txt
//   node observe.mjs my.txt     نشانی‌های دلخواه شما (هر خط یک URL)؛ فقط چاپ می‌کند
// curl به اینترنت وصل نمی‌شود: با --connect-to همهٔ اتصال‌ها به یک سرور محلی روی همین کامپیوتر می‌رود
// و آن سرور ثبت می‌کند چه خط درخواست و چه Host رسیده است.
import { execFile, execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { devNull } from 'node:os'

const file = process.argv[2] || 'urls.txt'
const urls = readFileSync(file, 'utf8').split(/\r?\n/).filter(l => l.trim())

let curlVersion
try { curlVersion = execFileSync('curl', ['--version'], { encoding: 'utf8' }).split(/\r?\n/)[0] }
catch { console.error('curl پیدا نشد. نصبش کنید و دوباره اجرا کنید.'); process.exit(1) }

// سرور محلی: فقط خط درخواست و Host را نگه می‌دارد
let seen = null
const server = net.createServer((sock) => {
  let buf = ''
  sock.on('error', () => {})
  sock.on('data', (d) => {
    buf += d.toString('latin1')
    if (!buf.includes('\r\n\r\n')) return
    const lines = buf.split('\r\n')
    const host = lines.find(l => /^host:/i.test(l))
    seen = { host: host ? host.slice(5).trim() : '', target: lines[0].split(' ')[1] }
    sock.end('HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
  })
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const port = server.address().port

const curl = url => new Promise((resolve) => {
  seen = null
  const args = ['-q', '-sv', '--noproxy', '*', '--max-time', '5', '--connect-to', `::127.0.0.1:${port}`, '-o', devNull, url]
  execFile('curl', args, { encoding: 'utf8' }, (err, _out, stderr) => {
    const raw = stderr.replace(/\r/g, '')
    resolve({ raw, result: seen || { error: (raw.match(/^curl: .*$/m) || [String(err?.message || 'بدون پاسخ')])[0] } })
  })
})

const out = { versions: { node: process.version, curl: curlVersion, platform: process.platform }, urls: {} }
let log = ''
for (const [i, url] of urls.entries()) {
  let browser
  try { const u = new URL(url); browser = { host: u.host, path: u.pathname, origin: u.origin } }
  catch (e) { browser = { error: e.message } }
  const { raw, result } = await curl(url)
  out.urls[i + 1] = { url, includes: url.includes('scu.test'), browser, curl: result }
  log += `### ${i + 1}  ${url}\n${raw}\n`
  console.log(`${i + 1}  ${url}`)
  console.log(`   includes: ${url.includes('scu.test')}`)
  console.log(`   browser : ${browser.error || `${browser.host}  ${browser.path}  origin=${browser.origin}`}`)
  console.log(`   curl    : ${result.error || `${result.host}  ${result.target}`}`)
}
server.close()

if (process.argv[2]) console.log('\n(فقط چاپ شد؛ observed.json تغییری نکرد)')
else {
  mkdirSync('evidence', { recursive: true })
  writeFileSync('observed.json', JSON.stringify(out, null, 2) + '\n')
  writeFileSync('evidence/curl.txt', `${curlVersion}\n\n${log}`)
  console.log('\n→ observed.json و evidence/curl.txt')
}
