import fs from "fs"

import newCSV from "./csv.js"
import newServer from "./server.js"
import Processor from "./processor.js"

import * as dotenv from "dotenv"
dotenv.config()

const path = process.argv[2] ? process.argv[2] : "rc.json"

function csvMode(config) {
  config.klines.forEach(async (k) => {
    const csv = newCSV(k)
    if (config.write) {
      await csv.write()
    }
    if (config.verify) {
      await csv.verify()
    }
    if (config.process) {
      await csv.process(Processor(k.options))
    }
  })
}

if (fs.existsSync(path)) {
  console.log(`rc file: using ${path}`)
  const config = JSON.parse(fs.readFileSync(path))
  switch (config.mode) {
    case "predict":
      console.log("Running in predict mode")
      newServer(process.env.MINDSDB_URL, process.env.PORT || 8080, config)
      break
    default:
      console.log("Running in csv mode")
      csvMode(config)
  }
} else {
  console.log(`rc file: ${path} not found`)
}
