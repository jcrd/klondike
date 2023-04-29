import { parse } from "url"

import { WebSocketServer } from "ws"
import express from "express"

import newStream from "./stream.js"
import Processor from "./processor.js"
import Predictor from "./predictor.js"

const wsRoute = "/ws/"

export default function newServer(url, port, config) {
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
    const predictor = Predictor(url, processor.columns, k)
    const stream = await newStream(
      k,
      processor,
      async ({ kline, timestamp }) => {
        const result = await predictor.predict(kline, timestamp)
        websockets.forEach((ws) => ws.send(JSON.stringify(result)))
      }
    )

    const m = {
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

    models[k.options.model] = m
    if ("alias" in k.options) {
      models[k.options.alias] = m
    }
  })

  const app = express()

  const httpServer = app.listen(port, () => {
    console.log(`Running server on port: ${httpServer.address().port}`)
  })

  app.get("/predict/:model", async (req, res) => {
    const model = req.params.model
    if (model in models) {
      const m = models[model]
      const v =
        req.query.moment === "true"
          ? m.stream.getMoment()
          : m.stream.getRecent()
      if (v === undefined) {
        res.status(503)
        res.send()
        return
      }
      const result = await m.predictor.predict(v.kline, v.timestamp)
      res.status(200)
      res.json(result)
    } else {
      res.status(400)
      res.send()
    }
  })

  httpServer.on("upgrade", (request, socket, head) => {
    const { pathname } = parse(request.url)
    if (!pathname.startsWith(wsRoute)) {
      return
    }
    const model = pathname.replace(wsRoute, "")

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
}
