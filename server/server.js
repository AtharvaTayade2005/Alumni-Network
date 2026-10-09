import app from './src/app.js'
import config from './src/config/env.js'
import { closePool } from './src/config/database.js'
import { ensureDevDatabase, stopEmbeddedDevDatabase } from './src/config/devDbAutoStart.js'
import { startScheduler, stopScheduler } from './src/services/scheduler.js'
import { initialiseRealtime } from './src/sockets/index.js'

await ensureDevDatabase()

const server = app.listen(config.port, () => {
  console.log(`Alumni Network Portal API listening on port ${config.port}`)
})

// The websocket server shares the HTTP listener rather than opening a port of its
// own, so a client on one origin reaches both without a second proxy rule.
const io = initialiseRealtime(server)

startScheduler()

async function shutdown(signal) {
  console.log(`${signal} received, shutting down`)
  stopScheduler()
  await io.close()
  await stopEmbeddedDevDatabase()
  server.close(async () => {
    await closePool()
    process.exit(0)
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
