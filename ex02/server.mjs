import net from 'node:net'
import tls from 'node:tls'
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const secure = args.includes('--tls')
const portArg = args.find(a => !a.startsWith('--'))
const port = Number(portArg || 8000)

const SAMESITE = process.env.SAMESITE || 'Lax'
const START = 2000000

const sessions = new Map()
const balances = new Map()

function parseCookies(cookieHeader) {
  const cookies = {}
  if (!cookieHeader) return cookies
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const idx = part.indexOf('=')
    if (idx !== -1) {
      const name = part.slice(0, idx).trim()
      const val = part.slice(idx + 1).trim()
      if (name) {
        cookies[name] = val
      }
    }
  }
  return cookies
}

function onConnection(sock) {
  let buf = Buffer.alloc(0)
  sock.on('error', () => {})

  sock.on('data', (d) => {
    buf = Buffer.concat([buf, d])

    while (buf.length > 0) {
      const headerEndIndex = buf.indexOf('\r\n\r\n')
      if (headerEndIndex === -1) {
        break
      }

      const headerBuf = buf.subarray(0, headerEndIndex)
      const headerStr = headerBuf.toString('latin1')
      const lines = headerStr.split('\r\n')
      const requestLine = lines[0]
      const reqParts = requestLine.split(' ')

      if (reqParts.length < 3) {
        sock.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
        return
      }

      const method = reqParts[0]
      const fullUrl = reqParts[1]
      const httpVersion = reqParts[2]

      const headers = {}
      let hasHost = false
      let clCount = 0
      let clValue = 0
      let clConflicting = false
      let hasTransferEncoding = false

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i]
        if (!line) continue
        const colon = line.indexOf(':')
        if (colon === -1) continue
        const keyLower = line.substring(0, colon).trim().toLowerCase()
        const value = line.substring(colon + 1).trim()

        headers[keyLower] = value

        if (keyLower === 'host') {
          hasHost = true
        }
        if (keyLower === 'content-length') {
          clCount++
          const parsed = parseInt(value, 10)
          if (isNaN(parsed) || parsed < 0) {
            clConflicting = true
          }
          if (clCount > 1 && parsed !== clValue) {
            clConflicting = true
          }
          clValue = parsed
        }
        if (keyLower === 'transfer-encoding') {
          hasTransferEncoding = true
        }
      }

      if ((clCount > 0 && hasTransferEncoding) || clConflicting || (clCount > 1 && clConflicting)) {
        sock.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
        return
      }

      if (httpVersion === 'HTTP/1.1' && (!hasHost || !headers['host'])) {
        sock.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
        return
      }

      const expectedBodyLength = clCount > 0 ? clValue : 0
      const totalReqLength = headerEndIndex + 4 + expectedBodyLength

      if (buf.length < totalReqLength) {
        break
      }

      const bodyBuf = buf.subarray(headerEndIndex + 4, totalReqLength)
      buf = buf.subarray(totalReqLength)

      const cookieHeader = headers['cookie'] || ''
      const cookies = parseCookies(cookieHeader)
      const sessionToken = cookies['session']
      const hasSession = !!(sessionToken && sessions.has(sessionToken))
      const originVal = headers['origin'] || '-'
      const secFetchSiteVal = headers['sec-fetch-site'] || '-'
      console.log(`[REQ] ${method} ${fullUrl} | session=${hasSession} | Origin=${originVal} | Sec-Fetch-Site=${secFetchSiteVal}`)

      const qIndex = fullUrl.indexOf('?')
      const pathOnly = qIndex !== -1 ? fullUrl.slice(0, qIndex) : fullUrl
      const queryString = qIndex !== -1 ? fullUrl.slice(qIndex + 1) : ''

      const currentUser = hasSession ? sessions.get(sessionToken) : null
      const isConnectionClose = (headers['connection'] || '').toLowerCase() === 'close'

      function sendResponse(status, statusText, extraHeaders, body) {
        const bodyBuffer = Buffer.isBuffer(body) ? body : Buffer.from(body || '', 'utf-8')
        const headerLines = [`HTTP/1.1 ${status} ${statusText}`]
        let hasCL = false
        for (const [k, v] of Object.entries(extraHeaders)) {
          if (k.toLowerCase() === 'content-length') hasCL = true
          headerLines.push(`${k}: ${v}`)
        }
        if (!hasCL) {
          headerLines.push(`Content-Length: ${bodyBuffer.length}`)
        }
        if (isConnectionClose) {
          headerLines.push('Connection: close')
        }
        const respHead = headerLines.join('\r\n') + '\r\n\r\n'
        sock.write(Buffer.concat([Buffer.from(respHead, 'utf-8'), bodyBuffer]))
        if (isConnectionClose) {
          sock.end()
        }
      }

      if (pathOnly === '/' && method === 'GET') {
        const html = '<!DOCTYPE html><html><body>' +
          '<h1>Buffet Wallet</h1>' +
          '<form method="POST" action="/login">' +
            '<input name="user" />' +
            '<button type="submit">Login</button>' +
          '</form>' +
          '<form method="POST" action="/transfer">' +
            '<input name="to" />' +
            '<input name="amount" />' +
            '<button type="submit">Transfer</button>' +
          '</form>' +
        '</body></html>'
        sendResponse(200, 'OK', { 'Content-Type': 'text/html; charset=utf-8' }, html)
      } else if (pathOnly === '/' && method === 'DELETE') {
        sendResponse(405, 'Method Not Allowed', { 'Allow': 'GET, POST' }, '')
      } else if (pathOnly === '/hello' && method === 'GET') {
        let name = ''
        try {
          const sp = new URLSearchParams(queryString)
          name = sp.get('name') || ''
        } catch {
          name = ''
        }
        sendResponse(200, 'OK', { 'Content-Type': 'text/plain; charset=utf-8' }, `سلام ${name}`)
      } else if (pathOnly === '/echo' && method === 'POST') {
        sendResponse(200, 'OK', { 'Content-Type': headers['content-type'] || 'application/octet-stream' }, bodyBuf)
      } else if (pathOnly === '/login' && method === 'POST') {
        const params = new URLSearchParams(bodyBuf.toString('utf-8'))
        const user = params.get('user')
        if (!user) {
          sendResponse(400, 'Bad Request', {}, 'User is required')
        } else {
          if (!balances.has(user)) {
            balances.set(user, START)
          }
          const newToken = crypto.randomBytes(16).toString('hex')
          sessions.set(newToken, user)

          const cookieParts = [`session=${newToken}`, 'Path=/', 'HttpOnly']
          if (SAMESITE.toLowerCase() === 'strict') {
            cookieParts.push('SameSite=Strict')
          } else if (SAMESITE.toLowerCase() === 'lax') {
            cookieParts.push('SameSite=Lax')
          }
          sendResponse(200, 'OK', { 'Set-Cookie': cookieParts.join('; ') }, 'Logged in')
        }
      } else if (pathOnly === '/me' && method === 'GET') {
        if (!currentUser) {
          sendResponse(401, 'Unauthorized', {}, 'Unauthorized')
        } else {
          const bal = balances.get(currentUser) ?? START
          sendResponse(200, 'OK', { 'Content-Type': 'text/plain; charset=utf-8' }, `user=${currentUser} balance=${bal}`)
        }
      } else if (pathOnly === '/transfer' && method === 'POST') {
        const secFetch = headers['sec-fetch-site']
        if (secFetch !== undefined && secFetch !== 'same-origin' && secFetch !== 'none') {
          sendResponse(403, 'Forbidden', {}, 'CSRF rejected')
          continue
        }

        if (!currentUser) {
          sendResponse(401, 'Unauthorized', {}, 'Unauthorized')
        } else {
          const params = new URLSearchParams(bodyBuf.toString('utf-8'))
          const amount = parseInt(params.get('amount') || '0', 10)
          let bal = balances.get(currentUser) ?? START
          bal -= amount
          balances.set(currentUser, bal)
          sendResponse(200, 'OK', {}, 'Transfer complete')
        }
      } else if (pathOnly === '/logout' && method === 'POST') {
        if (sessionToken) {
          sessions.delete(sessionToken)
        }
        sendResponse(200, 'OK', {}, 'Logged out')
      } else {
        sendResponse(404, 'Not Found', {}, 'Not Found')
      }
    }
  })
}

let server
if (secure) {
  const certPath = process.env.TLS_CERT || 'cert.pem'
  const keyPath = process.env.TLS_KEY || 'key.pem'
  const options = {
    cert: readFileSync(certPath),
    key: readFileSync(keyPath),
  }
  server = tls.createServer(options, onConnection)
} else {
  server = net.createServer(onConnection)
}

server.listen(port, () => {
  console.log(`Server listening on port ${port} (TLS: ${secure})`)
})