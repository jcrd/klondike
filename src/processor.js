import { CCI, EMA, Stochastic, SMA, ROC, RSI } from "@debut/indicators"

import { KlineKeys, klineObject } from "./klines.js"
import { Indicator, handlers } from "./indicator.js"
import { newFixedArray } from "./utils.js"

const id = {
  kline: 0,
}

function ohlcProcessor(seconds) {
  const columns = ["id", ...Object.keys(KlineKeys)]
  return {
    columns,
    transform: (kline) => {
      return [id.kline, seconds ? kline[0] / 1000 : kline[0], ...kline.slice(1)]
    },
  }
}

function closeProcessor(seconds) {
  return {
    columns: ["id", "timestamp", "close"],
    transform: (kline) => [
      id.kline,
      seconds ? kline[KlineKeys.timestamp] / 1000 : kline[KlineKeys.timestamp],
      kline[KlineKeys.close],
    ],
  }
}

function indicatorsProcessor(
  { horizon, label, indicators, ohlc, binaryIndicators, binaryPrediction },
  stream
) {
  const indicatorsMap = {
    ema10: new Indicator(new EMA(10), {
      input: handlers.input.c,
      trend: handlers.trend.ma,
    }),
    sma10: new Indicator(new SMA(10), {
      input: handlers.input.c,
      trend: handlers.trend.ma,
    }),
    rsi: new Indicator(new RSI(), {
      input: handlers.input.c,
      trend: handlers.trend.oscillator(70, 30),
    }),
    roc: new Indicator(new ROC(), {
      input: handlers.input.c,
      trend: ({ value }) => (value < 0 ? -1 : 1),
    }),
    cci: new Indicator(new CCI(), {
      input: handlers.input.hlc,
      trend: handlers.trend.oscillator(200, -200),
    }),
    stoch: new Indicator(
      new Stochastic(),
      {
        input: handlers.input.hlc,
        output: (v) => {
          if (v === undefined || v.k === undefined || v.d === undefined) {
            return undefined
          }
          return [v.k, v.d]
        },
        trend: (() => {
          const h = handlers.trend.oscillator(80, 20)
          return ({ value }) => h({ value: value[0], priorValue: value[1] })
        })(),
      },
      ["stochK", "stochD"]
    ),
  }

  if (indicators) {
    for (const [name, state] of Object.entries(indicators)) {
      if (state === false) {
        delete indicatorsMap[name]
      }
    }
  }

  const priorValues = {}
  const horizonKlines = newFixedArray(horizon)
  const columns = []
  for (const [key, v] of Object.entries(indicatorsMap)) {
    if (v.columns) {
      columns.push(...v.columns)
    } else {
      columns.push(key)
    }
  }
  if (ohlc) {
    columns.push("open", "high", "low", "close")
  }
  if (!stream) {
    columns.push(label)
  }

  return {
    columns,
    transform: (kline, moment = false) => {
      const kobj = klineObject(kline)
      const values = Object.entries(indicatorsMap)
        .map(([name, indicator]) => {
          const value = indicator.value(kobj, moment)
          const priorValue = priorValues[name]

          if (value === undefined) {
            return undefined
          }

          priorValues[name] = value

          return binaryIndicators
            ? indicator.trend({ close: kobj.close, value, priorValue })
            : value
        })
        .flat()

      if (values.filter((v) => v === undefined).length > 0) {
        return null
      }

      if (ohlc) {
        values.push(kobj.open, kobj.high, kobj.low, kobj.close)
      }

      if (stream) {
        return values
      } else {
        const head = horizonKlines.add({ kline, values })
        if (head === undefined) {
          return null
        }
        return [
          ...head.values,
          binaryPrediction
            ? horizonKlines[0].kline[KlineKeys.close] < kline[KlineKeys.close]
              ? 1
              : -1
            : kline[KlineKeys.close],
        ]
      }
    },
  }
}

export default function Processor(options, stream = false) {
  options = {
    seconds: true,
    ...(options || {}),
  }

  switch (options.processor) {
    case "indicators":
      return indicatorsProcessor(options, stream)
    case "close":
      return closeProcessor(options.seconds)
    default:
      return ohlcProcessor(options.seconds)
  }
}
