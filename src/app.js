import fs from "fs"
import { WebSocketServer } from "ws"

import newCSV from "./csv.js"
import newStream from "./stream.js"
import Processor from "./processor.js"
import Predictor from "./predictor.js"

import * as dotenv from "dotenv"
dotenv.config()

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

async function streamMode(data, processor, predictor = undefined) {
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

  const transform = predictor === undefined ? async (k) => k : predictor.predict

  const stream = await newStream(data.klines, processor, async (kline) => {
    kline = await transform(kline)
    websockets.forEach((ws) => ws.send(JSON.stringify(kline)))
  })

  process.on("SIGINT", () => {
    predictor.abort()
    stream.disconnect()
    websockets.forEach((ws) => ws.close())
    wss.close()
    process.exit(0)
  })
}

async function predictMode(data) {
  const processor = Processor(data.options, true)
  const predictor = Predictor(
    process.env.MINDSDB_MODEL,
    process.env.MINDSDB_LABEL,
    processor.columns
  )
  await streamMode(data, processor, predictor)
}

if (fs.existsSync(path)) {
  console.log(`rc file: using ${path}`)
  const data = JSON.parse(fs.readFileSync(path))
  switch (data.mode) {
    case "predict":
      console.log("Running in predict mode")
      await predictMode(data)
      break
    case "stream":
      console.log("Running in stream mode")
      await streamMode(data, Processor(data.options, true))
      break
    default:
      console.log("Running in csv mode")
      await csvMode(data)
  }
} else {
  console.log(`rc file: ${path} not found`)
}
