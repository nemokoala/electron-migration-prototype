#!/usr/bin/env node
'use strict'

/*
 * 개발용 통합 실행 스크립트.
 *
 * 서버(ws) → 웹(Next.js) → 일렉트론을 한 번에 띄운다.
 * - 웹/서버 포트를 자동으로 비어있는 포트로 잡아 충돌을 피한다
 *   (예: 3000이 이미 사용 중이면 3001로).
 * - 웹이 실제로 응답할 때까지 기다린 뒤에 일렉트론을 띄운다
 *   (안 그러면 일렉트론이 빈 화면을 로드한다).
 * - 서버 WS 주소를 웹에 주입해, 자동으로 잡힌 포트끼리 서로 연결되게 한다.
 * - Ctrl+C(또는 자식 중 하나라도 종료) 시 나머지도 전부 정리한다.
 *
 * 사용:
 *   node scripts/dev.js
 *   WEB_PORT=3010 WS_PORT=4010 node scripts/dev.js   # 시작 포트 지정
 *   NO_ELECTRON=1 node scripts/dev.js                # 일렉트론 없이 서버+웹만
 */

const { spawn } = require('child_process')
const net = require('net')
const http = require('http')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const IS_WIN = process.platform === 'win32'
// Windows: npm은 .cmd라서 shell 없이 spawn하면 ENOENT/EINVAL이 난다.
// (Node 20+는 .cmd/.bat를 shell 없이 직접 spawn하는 것을 막음)
const NPM = 'npm'
const C = {
  server: '\x1b[34m', // blue
  web: '\x1b[32m', // green
  electron: '\x1b[35m', // magenta
  reset: '\x1b[0m',
  dim: '\x1b[2m',
}

const children = []
let shuttingDown = false

// 지정한 포트부터 시작해 비어있는 첫 포트를 찾는다.
// 호스트를 지정하지 않고 바인딩해 IPv6(`::`)/IPv4 어느 쪽이든 이미 점유된
// 포트를 걸러낸다. (127.0.0.1만 검사하면 `:::3000` 같은 IPv6 점유를 놓친다.)
function findFreePort(start) {
  return new Promise((resolve) => {
    const tryPort = (p) => {
      const srv = net.createServer()
      srv.once('error', () => tryPort(p + 1))
      srv.once('listening', () => srv.close(() => resolve(p)))
      srv.listen(p)
    }
    tryPort(start)
  })
}

// 자식 프로세스를 실행하고, 출력에 [이름] 접두사를 붙여 한 터미널에 모은다.
function run(name, cmd, args, env) {
  const child = spawn(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    // Unix: 프로세스 그룹으로 손자까지 정리. Windows에서는 그룹 kill이 안 되고
    // .cmd + detached가 EINVAL을 내므로 shell만 켠다.
    detached: !IS_WIN,
    shell: IS_WIN,
    windowsHide: true,
  })
  const color = C[name] || ''
  const prefix = `${color}[${name}]${C.reset}`

  const pipe = (stream) => {
    let buf = ''
    stream.on('data', (d) => {
      buf += d.toString()
      const lines = buf.split('\n')
      buf = lines.pop()
      for (const line of lines) process.stdout.write(`${prefix} ${line}\n`)
    })
  }
  pipe(child.stdout)
  pipe(child.stderr)

  child.on('exit', (code) => {
    if (!shuttingDown) {
      process.stdout.write(`${prefix} 종료됨 (code=${code}) — 전체 정리\n`)
      shutdown()
    }
  })

  children.push(child)
  return child
}

// 웹 서버가 실제로 응답할 때까지 폴링한다.
function waitForHttp(url, timeoutMs = 40000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.destroy()
        resolve()
      })
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error('timeout'))
        else setTimeout(attempt, 500)
      })
    }
    attempt()
  })
}

function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  for (const c of children) {
    try {
      if (IS_WIN) {
        // /T = 자식 트리까지 종료 (shell로 띄운 npm 손자 포함)
        spawn('taskkill', ['/pid', String(c.pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        })
      } else {
        // 음수 pid = 프로세스 그룹 전체에 시그널 (detached 덕분에 가능)
        process.kill(-c.pid, 'SIGTERM')
      }
    } catch {
      try {
        c.kill('SIGTERM')
      } catch {
        /* 무시 */
      }
    }
  }
  setTimeout(() => process.exit(0), 600)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

;(async () => {
  const webPort = await findFreePort(Number(process.env.WEB_PORT) || 3010)
  const wsPort = await findFreePort(Number(process.env.WS_PORT) || 4000)

  process.stdout.write(
    `\n${C.dim}▶ web: http://localhost:${webPort}   ws: ws://localhost:${wsPort}${C.reset}\n\n`
  )

  // 1) WS 서버
  run('server', NPM, ['--prefix', 'server', 'start'], {
    PORT: String(wsPort),
  })

  // 2) 웹 (Next.js) — 포트와 WS 주소를 주입
  run('web', NPM, ['--prefix', 'web', 'run', 'dev'], {
    PORT: String(webPort),
    NEXT_PUBLIC_WS_URL: `ws://localhost:${wsPort}`,
  })

  // 3) 웹이 준비되면 일렉트론
  if (process.env.NO_ELECTRON) {
    process.stdout.write(`${C.dim}(NO_ELECTRON: 일렉트론은 건너뜀)${C.reset}\n`)
    return
  }

  try {
    await waitForHttp(`http://localhost:${webPort}`)
  } catch {
    process.stdout.write('web 준비 대기 실패 — 정리\n')
    return shutdown()
  }
  process.stdout.write(`${C.dim}✓ web 준비됨 → 일렉트론 실행${C.reset}\n`)

  run('electron', NPM, ['--prefix', 'electron', 'run', 'start'], {
    APP_URL: `http://localhost:${webPort}`,
  })
})()
