import puppeteer from 'puppeteer-core'

const url = process.argv[2] ?? 'http://127.0.0.1:4173/'
const out = process.argv[3] ?? '/tmp/transit-shot.png'
const width = Number(process.argv[4] ?? 390)
const height = Number(process.argv[5] ?? 900)

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  defaultViewport: { width, height, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
})
const page = await browser.newPage()
page.on('console', (msg) => console.log('[console]', msg.type(), msg.text()))
page.on('pageerror', (err) => console.log('[pageerror]', err.message))
await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 })
await new Promise((r) => setTimeout(r, 800))
await page.screenshot({ path: out, fullPage: true })
console.log('saved', out)
await browser.close()
