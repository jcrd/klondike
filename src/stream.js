import { Console } from "console"

import { WebsocketStream } from "@binance/connector"

import klines, { parseKline } from "./klines.js"

const logger = new Console({ stdout: process.stdout, stderr: process.stderr })

function klineWebsocket(symbol, interval, callback) {
  const callbacks = {
    message: async (data) => {
      data = JSON.parse(data)
      const k = data.k
      if (k.x) {
        await callback(parseKline([k.t, k.o, k.h, k.l, k.c]))
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
    disconnect: () => client.disconnect(),
  }
}

export default async function newStream(
  { symbol, interval, suffix },
  processor,
  callback
) {
  const intervalName = String(interval) + suffix

  let recentKline
  for await (const kline of klines({ symbol, interval, suffix, limit: 60 })) {
    const k = processor.transform(kline)
    if (k !== null) {
      recentKline = k
    }
  }

  if (recentKline !== undefined) {
    callback(recentKline)
  } else {
    logger.error(
      `Recent ${intervalName} kline is undefined; limit may be insufficient`
    )
  }

  return klineWebsocket(symbol, intervalName, async (kline) => {
    const k = processor.transform(kline)
    if (k !== null) {
      await callback(k)
    }
  })
}
