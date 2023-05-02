import { Spot } from "@binance/connector"

import { newInterval } from "./utils.js"

const maxKlineLimit = 1000

export const KlineKeys = {
  timestamp: 0,
  open: 1,
  high: 2,
  low: 3,
  close: 4,
}

const client = new Spot("", "", { baseURL: "https://api.binance.us" })

export function parseKline(k) {
  return [Number(k[0]), ...k.slice(1, 5).map((s) => parseFloat(s))]
}

export function klineName(k) {
  return [k.symbol, k.interval, k.suffix].join("")
}

export function klineObject(k) {
  const obj = {}
  const keys = Object.keys(KlineKeys)
  for (const [i, v] of k.entries()) {
    obj[keys[i]] = v
  }
  return obj
}

export async function getKlines(
  symbol,
  interval,
  limit = 1,
  timestamp = undefined
) {
  const args = {
    limit,
  }
  if (timestamp) {
    args.endTime = timestamp
  }
  const data = (await client.klines(symbol, interval, args)).data
  if (limit === 1) {
    return parseKline(data[0])
  }
  return data.map((d) => parseKline(d))
}

export async function getRecentTimestamp(symbol, interval) {
  return (await getKlines(symbol, interval))[0]
}

export default function klines({ symbol, interval, suffix, limit }) {
  const [intervalSeconds, intervalName] = newInterval(interval, suffix)
  const iters = Math.ceil(limit / maxKlineLimit)
  let lastEndTime = 0

  return {
    run: async function* () {
      for (let i = 0; i < iters; i++) {
        let lines
        if (i == 0) {
          lines = (
            await client.klines(symbol, intervalName, {
              startTime:
                (await getRecentTimestamp(symbol, intervalName)) -
                intervalSeconds * (limit - 1) * 1000,
              limit: maxKlineLimit,
            })
          ).data
        } else {
          lines = (
            await client.klines(symbol, intervalName, {
              startTime: lastEndTime + 1,
              limit,
            })
          ).data
        }

        limit -= maxKlineLimit

        if (lines.length === 0) {
          continue
        }

        lastEndTime = lines[lines.length - 1][0]

        for (const k of lines) {
          yield parseKline(k)
        }
      }
    },
  }
}
