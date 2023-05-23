import { Source } from "binoc"

export function processMoment(processor, s, m) {
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

async function newStream(
  source,
  { symbol, interval, limit },
  processor,
  callback
) {
  let recent
  let recentKline

  for await (const kline of source.klines({
    symbol,
    interval,
    limit,
  })) {
    recentKline = kline
    const k = processor.transform(kline)
    if (k !== null) {
      recent = {
        kline: k,
        timestamp: kline.timestamp,
      }
    }
  }

  if (recent !== undefined) {
    await callback(recent)
  } else {
    logger.error(
      `Recent ${interval} kline is undefined; limit may be insufficient`
    )
  }

  const momentValueFunc = source.subscribe(symbol, interval, async (kline) => {
    recentKline = kline
    const k = processor.transform(kline)
    if (k !== null) {
      recent = {
        kline: k,
        timestamp: kline.timestamp,
      }
      await callback(recent)
    }
  })

  return {
    getRecent: () => recent,
    getRecentKline: () => recentKline,
    getMomentKline: momentValueFunc,
  }
}

export class Streams {
  constructor() {
    this.source = new Source()
    this.streams = {}
    this.momentStreams = {}
    this.momentKlines = {}
  }

  async subscribe(k, processor, callback) {
    const name = klineName(k)
    if (!(name in this.streams)) {
      this.streams[name] = {
        callbacks: [],
      }

      const stream = await newStream(this.source, k, processor, (data) =>
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
      this.momentStreams[k.symbol] = this.source.subscribe(
        k.symbol,
        "1s",
        (kline) => {
          this.momentKlines[k.symbol] = kline
        }
      )
    }
    const s = this.streams[name]
    s.callbacks.push(callback)
    return s.stream
  }

  unsubscribe(k, callback) {
    const name = klineName(k)
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
