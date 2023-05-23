import fs from "fs"

import * as csv from "csv"
import progress from "cli-progress"

import { Source, KlineKeys, parseKlineArray, parseIntervalSeconds } from "binoc"

async function process(path, processor) {
  const ppath = path + "-processed.csv"
  const stream = fs.createWriteStream(ppath)

  fs.createReadStream(path + ".csv")
    .pipe(csv.parse({ from_line: 2 }))
    .pipe(csv.transform((kline) => processor.transform(parseKlineArray(kline))))
    .pipe(
      csv.stringify({
        header: true,
        columns: processor.columns,
      })
    )
    .pipe(stream)

  return new Promise((resolve) => {
    stream.once("finish", () => {
      console.log(`Processed file: ${ppath}`)
      resolve()
    })
  })
}

async function verify(path, intervalSeconds) {
  let last = 0
  const stream = fs.createReadStream(path)

  stream.pipe(csv.parse({ from_line: 2 })).on("data", (kline) => {
    kline = parseKlineArray(kline)
    const now = kline[0]
    const expect = last + intervalSeconds * 1000
    if (last > 0 && now !== expect) {
      console.log(`Bad timestamp: actual ${now}, expected ${expect}`)
    }
    last = now
  })

  return new Promise((resolve) =>
    stream.once("close", () => {
      console.log("Verification complete")
      resolve()
    })
  )
}

export async function write(path, generator, columns, limit, withBar = true) {
  const data = csv.stringify({ header: true, columns })
  const bar = new progress.SingleBar()

  if (withBar) {
    bar.start(limit, 0)
  }

  for await (const item of generator) {
    data.write(item)
    bar.increment()
  }

  data.end()

  const stream = fs.createWriteStream(path)

  data.pipe(stream)

  return new Promise((resolve) => {
    stream.once("finish", () => {
      bar.stop()
      console.log(`Wrote file: ${path}`)
      resolve()
    })
  })
}

export default function newCSV({ symbol, interval, limit }, datadir = "data") {
  const path = `${datadir}/${symbol}_${interval}_${limit}`
  const pathExt = path + ".csv"
  const intervalSeconds = parseIntervalSeconds(interval)
  const source = new Source()

  return {
    path: pathExt,
    write: async () =>
      write(
        pathExt,
        source.klines({ symbol, interval, limit }),
        KlineKeys,
        limit
      ),
    verify: async () => verify(pathExt, intervalSeconds),
    process: async (p) => process(path, p),
  }
}
