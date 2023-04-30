import { Console } from "console"

import { WebsocketStream } from "@binance/connector"

import klines, { parseKline, KlineKeys } from "./klines.js"

const logger = new Console({ stdout: process.stdout, stderr: process.stderr })

function klineWebsocket(symbol, interval, callback) {
  let moment
  const callbacks = {
    message: async (data) => {
      data = JSON.parse(data)
      const k = data.k
      moment = parseKline([k.t, k.o, k.h, k.l, k.c])
      if (k.x) {
        await callback(moment)
      }
    },
  }

  const client = new WebsocketStream({
    wsURL: "wss://stream.binance.us:9443",
    logger,
    callbacks,
  })
  client.kline(symbol.toLowerCase(), interval)

  return {
    getMoment: () => moment,
    disconnect: () => client.disconnect(),
  }
}

async function newStream(
  { symbol, interval, suffix, limit },
  processor,
  callback
) {
  const intervalName = String(interval) + suffix
  let recent
  let recentKline

  for await (const kline of klines({ symbol, interval, suffix, limit })) {
    recentKline = kline
    const k = processor.transform(kline)
    if (k !== null) {
      recent = {
        kline: k,
        timestamp: kline[KlineKeys.timestamp],
      }
    }
  }

  if (recent !== undefined) {
    await callback(recent)
  } else {
    logger.error(
      `Recent ${intervalName} kline is undefined; limit may be insufficient`
    )
  }

  const ws = klineWebsocket(symbol, intervalName, async (kline) => {
    recentKline = kline
    const k = processor.transform(kline)
    if (k !== null) {
      recent = {
        kline: k,
        timestamp: kline[KlineKeys.timestamp],
      }
      await callback(recent)
    }
  })

  return {
    getRecent: () => recent,
    getMoment: () => {
      const kline = ws.getMoment() || recentKline
      if (kline === undefined) {
        return undefined
      }

      const k = processor.transform(kline, true)
      if (k === null) {
        return undefined
      }

      return {
        kline: k,
        timestamp: kline[KlineKeys.timestamp],
      }
    },
    disconnect: ws.disconnect,
  }
}

export class Streams {
  constructor() {
    this.streams = {}
  }

  async subscribe(k, processor, callback) {
    const name = [k.symbol, k.interval, k.suffix].join("")
    if (!(name in this.streams)) {
      this.streams[name] = {
        callbacks: [],
      }

      this.streams[name].stream = await newStream(k, processor, (data) =>
        this.streams[name].callbacks.forEach((c) => c(data))
      )
    }
    const s = this.streams[name]
    s.callbacks.push(callback)
    return s.stream
  }

  unsubscribe(k, callback) {
    const name = [k.symbol, k.interval, k.suffix].join("")
    if (!(name in this.streams)) {
      return
    }
    const s = this.streams[name]
    s.callbacks = s.callbacks.filter((c) => c !== callback)
    if (s.callbacks.length === 0) {
      s.stream.disconnect()
    }
  }
}
