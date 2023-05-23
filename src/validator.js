import fs from "fs"

import * as csv from "csv"

import * as dotenv from "dotenv"

import { Source } from "binoc"

import { write as writeCSV } from "./csv.js"
import Predictor from "./predictor.js"
import Processor from "./processor.js"
import { processMoment } from "./stream.js"

dotenv.config()

function getRandom(min, max) {
  return Math.floor(Math.random() * (max - min)) + min
}

async function getRandomRows(count, dataPath, columns, minRow, maxRow) {
  const idxs = []
  for (let i = 0; i < count; i++) {
    idxs.push(getRandom(minRow, maxRow))
  }

  const rows = []
  const stream = fs.createReadStream(dataPath)

  let i = 0
  stream.pipe(csv.parse({ from_line: 2 })).on("data", (input) => {
    if (idxs.includes(i)) {
      const row = {}
      for (const [i, c] of columns.entries()) {
        row[c] = input[i]
      }
      rows.push(row)
    }
    i++
  })

  await new Promise((resolve) => stream.once("close", resolve))

  return rows
}

async function* generator(
  predictUrl,
  { count, dataPath, dataColumns, minRow, maxRow },
  klineConfig,
  beforeLockSeconds
) {
  const { symbol, interval, limit, options } = klineConfig
  const processor = Processor(options, true)
  const predictor = Predictor(predictUrl, processor.columns, klineConfig)
  const rounds = await getRandomRows(
    count,
    dataPath,
    dataColumns,
    minRow,
    maxRow
  )
  const source = new Source()

  for (const r of rounds) {
    const endTime = (r.lockTimestamp - beforeLockSeconds) * 1000

    let last
    for await (const kline of source.klines({
      symbol,
      interval,
      limit,
      endTime,
    })) {
      const k = processor.transform(kline)
      if (k !== null) {
        last = k
      }
    }
    if (last === undefined) {
      console.log("Last kline is undefined")
      return
    }

    const s = await source.getKlines(symbol, "1s", { endTime })
    const m = processMoment(processor, s, last)
    const p = await predictor.predict(m.kline, m.timestamp)

    const ret = [r, p]
    yield ret
  }
}

export function Validator(configPath, outdir, columns, beforeLockSeconds = 60) {
  const predictUrl = process.env.MINDSDB_URL
  const config = JSON.parse(fs.readFileSync(configPath))

  const doWrite = async (transform) => {
    for (const k of config.klines) {
      await writeCSV(
        `${outdir}/${k.options.model}.csv`,
        async function* () {
          for await (const data of generator(
            predictUrl,
            config.options,
            k,
            beforeLockSeconds
          )) {
            yield transform(k, data)
          }
        },
        columns,
        config.options.count * config.klines.length
      )
    }
  }

  const doProcess = async (callback) => {
    for (const k of config.klines) {
      const stream = fs.createReadStream(`${outdir}/${k.options.model}.csv`)
      stream
        .pipe(csv.parse({ from_line: 2 }))
        .on("data", (input) => callback(k, input))
      await new Promise((resolve) => stream.once("close", resolve))
    }
  }

  return {
    write: config.write ? doWrite : async () => {},
    process: config.process ? doProcess : async () => {},
  }
}
