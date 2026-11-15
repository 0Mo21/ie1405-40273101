// خودآزمایی تمرین ۳. از داخل پوشهٔ ex03:
//   node check/check.mjs https://cv.ie1405-401234567.workers.dev    ← سایت زنده
//   node check/check.mjs http://localhost:8787                       ← اجرای محلی با npx wrangler dev
// خروجی در evidence/check.txt هم نوشته می‌شود.
import { mkdirSync, writeFileSync } from 'node:fs'
import { publicTests, run } from './tests.mjs'

const base = process.argv[2]
if (!/^https?:\/\//.test(base ?? '')) {
  console.log('نشانی Worker را بدهید، مثلاً:\n  node check/check.mjs https://cv.ie1405-401234567.workers.dev')
  process.exit(1)
}

const lines = []
const say = s => { lines.push(s); console.log(s) }
say(`نشانی: ${base}\n`)
const rows = await run(base, publicTests)
for (const r of rows) say(`${r.ok ? '✓' : '✗'} [${r.part}] ${r.label}${r.ok ? '' : `\n    ${r.why}`}`)
const sum = rows.reduce((s, r) => s + (r.ok ? r.max : 0), 0)
say(`\nجمع: ${sum} از ۶ (آزمون‌های پنهان ۱ و answers.json ۳ نمرهٔ دیگرند)`)
say(`Node ${process.version} · ${new Date().toISOString()}`)

mkdirSync('evidence', { recursive: true })
writeFileSync('evidence/check.txt', lines.join('\n') + '\n')
console.log('\nخروجی در evidence/check.txt ذخیره شد.')
