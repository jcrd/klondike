import fs from "fs"

import newCSV from "./csv.js"
import Processor from "./processor.js"

const path = process.argv[2] ? process.argv[2] : "rc.json"

if (fs.existsSync(path)) {
  console.log(`rc file: using ${path}`)
  const data = JSON.parse(fs.readFileSync(path))
  const csv = newCSV(data.klines)

  if (data.write) {
    await csv.write()
  }
  if (data.verify) {
    await csv.verify()
  }
  if (data.process) {
    await csv.process(Processor())
  }
} else {
  console.log(`rc file: ${path} not found`)
}
