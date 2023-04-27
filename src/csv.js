import fs from "fs"

import * as csv from "csv"
import progress from "cli-progress"

import klines, { KlineKeys, parseKline } from "./klines.js"
import { newInterval } from "./utils.js"

async function process(path, processor) {
  const ppath = path + "-processed.csv"
  const stream = fs.createWriteStream(ppath)

  fs.createReadStream(path + ".csv")
    .pipe(csv.parse({ from_line: 2 }))
    .pipe(csv.transform((kline) => processor.transform(parseKline(kline))))
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
    kline = parseKline(kline)
    const now = kline[0]
    const expect = last + intervalSeconds * 1000
    if (last > 0 && now !== expect) {
      console.log(`Bad timestamp: actual ${now}, expected ${expect}`)
    }
    last = now
  })

  return new Promise((resolve) => stream.once("close", resolve))
}

async function write(path, args, withBar = true) {
  const data = csv.stringify({ header: true, columns: Object.keys(KlineKeys) })
  const bar = new progress.SingleBar()

  if (withBar) {
    bar.start(args.limit, 0)
  }

  for await (const kline of klines(args)) {
    data.write(kline)
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

export default function newCSV(args, datadir = "data") {
  const path = `${datadir}/${args.symbol}_${args.interval}${args.suffix}_${args.limit}`
  const pathExt = path + ".csv"
  const [intervalSeconds, _] = newInterval(args.interval, args.suffix)

  return {
    path: pathExt,
    write: async () => write(pathExt, args),
    verify: async () => verify(pathExt, intervalSeconds),
    process: async (p) => process(path, p),
  }
}
