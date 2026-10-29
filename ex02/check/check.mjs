// خودآزمایی تمرین ۲. از داخل پوشهٔ ex02 اجرا کنید:  node check/check.mjs
// سرور شما (server.py یا server.mjs) را خودش اجرا می‌کند، یک بار روی HTTP و یک بار با --tls،
// و خروجی را در evidence/check.txt هم می‌نویسد.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { runPublic, publicRows } from './tests.mjs'

const dir = resolve(process.argv[2] || '.')
const lines = []
const log = console.log
console.log = (...a) => { lines.push(a.join(' ')); log(...a) }

let res
try { res = await runPublic(dir) } catch (e) { console.log(`خطا: ${e.message}`); process.exit(1) }

const rows = publicRows(res)
const sum = rows.reduce((s, r) => s + r.score, 0)
console.log('\nنمرهٔ آزمون‌های عمومی:')
for (const r of rows) console.log(`  ${r.label}: ${r.score} از ${r.max}`)
console.log(`  جمع: ${Math.round(sum * 100) / 100} از ۷ (آزمون‌های پنهان ۱ و answers.json ۲ نمرهٔ دیگرند)`)
console.log(`\nNode ${process.version} · ${process.platform} · ${new Date().toISOString()}`)

mkdirSync(join(dir, 'evidence'), { recursive: true })
writeFileSync(join(dir, 'evidence', 'check.txt'), lines.join('\n') + '\n')
log('\nخروجی در evidence/check.txt ذخیره شد.')
process.exit(0)
