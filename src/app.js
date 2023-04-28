import { createServer } from "http"
import { parse } from "url"
import { WebSocketServer } from "ws"
import fs from "fs"

import newCSV from "./csv.js"
import newStream from "./stream.js"
import Processor from "./processor.js"
import Predictor from "./predictor.js"

import * as dotenv from "dotenv"
dotenv.config()

const path = process.argv[2] ? process.argv[2] : "rc.json"

function csvMode(config) {
  config.klines.forEach(async (k) => {
    const csv = newCSV(k)
    if (config.write) {
      await csv.write()
    }
    if (config.verify) {
      await csv.verify()
    }
    if (config.process) {
      await csv.process(Processor(k.options))
    }
  })
}

function predictMode(config) {
  const models = {}

  config.klines.forEach(async (k) => {
    const server = new WebSocketServer({ noServer: true })
    let websockets = []

    server.on("connection", (ws) => {
      websockets.push(ws)
      ws.on("close", () => {
        websockets = websockets.filter((s) => s !== ws)
      })
    })

    const processor = Processor(k.options, true)
    const predictor = Predictor(process.env.MINDSDB_URL, processor.columns, k)
    const stream = await newStream(
      k,
      processor,
      async ({ kline, timestamp }) => {
        const result = await predictor.predict(kline, timestamp)
        websockets.forEach((ws) => ws.send(JSON.stringify(result)))
      }
    )

    models[k.options.model] = {
      server,
      stream,
      predictor,
      destroy: () => {
        stream.disconnect()
        predictor.abort()
        websockets.forEach((ws) => ws.close())
        server.close()
      },
    }
  })

  const httpServer = createServer(async (req, res) => {
    const { pathname } = parse(req.url)
    const model = pathname.replace("/", "")
    if (req.method === "GET") {
      res.setHeader("Content-Type", "application/json")
      if (model in models) {
        const m = models[model]
        const recent = m.stream.getRecent()
        if (recent === undefined) {
          res.writeHead(503)
          res.end()
          return
        }
        const result = await m.predictor.predict(recent.kline, recent.timestamp)
        res.writeHead(200)
        res.end(JSON.stringify(result))
      } else {
        res.writeHead(400)
        res.end()
      }
    }
  })

  httpServer.on("upgrade", (request, socket, head) => {
    const { pathname } = parse(request.url)
    const model = pathname.replace("/", "")

    if (model in models) {
      const s = models[model].server
      s.handleUpgrade(request, socket, head, (ws) => {
        s.emit("connection", ws, request)
      })
    } else {
      socket.destroy()
    }
  })

  process.on("SIGINT", () => {
    Object.values(models).forEach((m) => m.destroy())
    httpServer.close((err) => {
      process.exit(err ? 1 : 0)
    })
  })

  httpServer.listen(process.env.PORT || 8080, () => {
    console.log(`Running server on port: ${httpServer.address().port}`)
  })
}

if (fs.existsSync(path)) {
  console.log(`rc file: using ${path}`)
  const config = JSON.parse(fs.readFileSync(path))
  switch (config.mode) {
    case "predict":
      console.log("Running in predict mode")
      predictMode(config)
      break
    default:
      console.log("Running in csv mode")
      csvMode(config)
  }
} else {
  console.log(`rc file: ${path} not found`)
}
