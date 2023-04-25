import fs from "fs"
import { WebSocketServer } from "ws"

import newCSV from "./csv.js"
import newStream from "./stream.js"
import Processor from "./processor.js"

const path = process.argv[2] ? process.argv[2] : "rc.json"

async function csvMode(data) {
  const csv = newCSV(data.klines)

  if (data.write) {
    await csv.write()
  }
  if (data.verify) {
    await csv.verify()
  }
  if (data.process) {
    await csv.process(Processor(data.options))
  }
}

async function streamMode(data) {
  const port = process.env.PORT || 8080
  const wss = new WebSocketServer({ port })
  let websockets = []

  wss.on("connection", (ws) => {
    websockets.push(ws)
    ws.on("close", () => {
      websockets = websockets.filter((s) => s !== ws)
    })
  })

  console.log(`Streaming on port: ${port}`)

  const stream = await newStream(
    data.klines,
    Processor(data.options, true),
    (kline) => {
      websockets.forEach((ws) => ws.send(JSON.stringify(kline)))
    }
  )

  process.on("SIGINT", () => {
    stream.disconnect()
    websockets.forEach((ws) => ws.close())
    wss.close()
    process.exit(0)
  })
}

if (fs.existsSync(path)) {
  console.log(`rc file: using ${path}`)
  const data = JSON.parse(fs.readFileSync(path))
  switch (data.mode) {
    case "stream":
      await streamMode(data)
      break
    default:
      await csvMode(data)
  }
} else {
  console.log(`rc file: ${path} not found`)
}
