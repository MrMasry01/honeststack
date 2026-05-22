import { createServer } from 'http'
import { readFile, stat } from 'fs/promises'
import { join, extname } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = join(__dirname, 'dist')
const PORT = process.env.PORT || 3000

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.json': 'application/json',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
  '.ttf':  'font/ttf',
}

async function serve(req, res) {
  let pathname = new URL(req.url, `http://localhost`).pathname
  let filePath = join(DIST, pathname)

  try {
    const s = await stat(filePath)
    if (s.isDirectory()) filePath = join(filePath, 'index.html')
  } catch {
    // not found → SPA fallback
    filePath = join(DIST, 'index.html')
  }

  try {
    const data = await readFile(filePath)
    const ext = extname(filePath)
    const ct = MIME[ext] || 'application/octet-stream'
    res.writeHead(200, {
      'Content-Type': ct,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public,max-age=31536000,immutable',
    })
    res.end(data)
  } catch {
    res.writeHead(404)
    res.end('Not found')
  }
}

createServer(serve).listen(PORT, () => {
  console.log(`Cockpit serving on http://localhost:${PORT}`)
})
