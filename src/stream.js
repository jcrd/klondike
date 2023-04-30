import { Console } from "console"

import { WebsocketStream } from "@binance/connector"

import klines, { parseKline, KlineKeys } from "./klines.js"

const logger = new Console({ stdout: process.stdout, stderr: process.stderr })

const intervalName = (i, s) => String(i) + s

function processMoment(processor, s, m) {
  if (s === undefined || m === undefined) {
    return undefined
  }

  m[KlineKeys.timestamp] = s[KlineKeys.timestamp]
  m[KlineKeys.close] = s[KlineKeys.close]

  if (s[KlineKeys.high] > m[KlineKeys.high]) {
    m[KlineKeys.high] = s[KlineKeys.high]
  }
  if (s[KlineKeys.low] < m[KlineKeys.low]) {
    m[KlineKeys.low] = s[KlineKeys.low]
  }

  const k = processor.transform(m, true)
  if (k !== null) {
    return {
      kline: k,
      timestamp: m[KlineKeys.timestamp],
    }
  }
}

function klineWebsocket(symbol, interval, callback) {
  let momentKline
  const callbacks = {
    message: async (data) => {
      data = JSON.parse(data)
      const k = data.k
      momentKline = parseKline([k.t, k.o, k.h, k.l, k.c])
      if (k.x) {
        await callback(momentKline)
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
    getMomentKline: () => momentKline,
    disconnect: () => client.disconnect(),
  }
}

async function newStream(
  { symbol, interval, suffix, limit },
  processor,
  callback
) {
  const intName = intervalName(interval, suffix)
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
      `Recent ${intName} kline is undefined; limit may be insufficient`
    )
  }

  const ws = klineWebsocket(symbol, intName, async (kline) => {
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
    getRecentKline: () => recentKline,
    ...ws,
  }
}

export class Streams {
  constructor() {
    this.streams = {}
    this.momentStreams = {}
    this.momentKlines = {}
  }

  async subscribe(k, processor, callback) {
    const name = [k.symbol, k.interval, k.suffix].join("")
    if (!(name in this.streams)) {
      this.streams[name] = {
        callbacks: [],
      }

      const stream = await newStream(k, processor, (data) =>
        this.streams[name].callbacks.forEach((c) => c(data))
      )

      this.streams[name].stream = {
        ...stream,
        getMoment: () =>
          processMoment(
            processor,
            this.momentKlines[k.symbol],
            stream.getMomentKline() || stream.getRecentKline()
          ),
      }
    }
    if (!(k.symbol in this.momentStreams)) {
      this.momentStreams[k.symbol] = klineWebsocket(k.symbol, "1s", (kline) => {
        this.momentKlines[k.symbol] = kline
      })
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
