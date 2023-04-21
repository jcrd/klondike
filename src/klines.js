import { Spot } from "@binance/connector"

const maxKlineLimit = 1000

export const KlineKeys = {
  timestamp: 0,
  open: 1,
  high: 2,
  low: 3,
  close: 4,
  volume: 5,
}

const client = new Spot("", "", { baseURL: "https://api.binance.us" })

export function parseKline(k) {
  return [Number(k[0]), ...k.slice(1, 6).map((s) => parseFloat(s))]
}

export function klineObject(k) {
  const obj = {}
  const keys = Object.keys(KlineKeys)
  for (const [i, v] of k.entries()) {
    obj[keys[i]] = v
  }
  return obj
}

export async function getKline(symbol, interval, timestamp = undefined) {
  const args = {
    limit: 1,
  }
  if (timestamp) {
    args.startTime = timestamp
  }
  return (await client.klines(symbol, interval, args)).data[0]
}

export async function getRecentTimestamp(symbol, interval) {
  return (await getKline(symbol, interval))[0]
}

export default async function* klines({ symbol, interval, suffix, limit }) {
  const intervalName = String(interval) + suffix
  let lastEndTime = 0

  for (let i = 0; i < Math.ceil(limit / maxKlineLimit); i++) {
    let lines
    if (i == 0) {
      lines = (
        await client.klines(symbol, intervalName, {
          startTime:
            (await getRecentTimestamp(symbol, intervalName)) -
            interval * (limit - 1) * 1000,
          limit: maxKlineLimit,
        })
      ).data
    } else {
      lines = (
        await client.klines(symbol, intervalName, {
          startTime: lastEndTime + interval * 1000,
          limit: maxKlineLimit,
        })
      ).data
    }

    if (lines.length === 0) {
      continue
    }

    lastEndTime = lines[lines.length - 1][0]

    for (const k of lines) {
      yield parseKline(k)
    }
  }
}
