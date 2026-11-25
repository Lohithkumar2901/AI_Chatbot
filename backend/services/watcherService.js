const fs = require("fs")
const path = require("path")

const { ingestFile } = require("./ingestService")
const { removeDocumentVectors, reloadVectors } = require("./vectorService")

const POLICY_FOLDER = path.join(__dirname, "../../data/policies")
const CIS_FOLDER = path.join(__dirname, "../../data/CIS")

/* Debounce map to prevent duplicate events from fs.watch */
const debounceTimers = {}

function debounce(key, fn, delay = 3000) {
  if (debounceTimers[key]) clearTimeout(debounceTimers[key])
  debounceTimers[key] = setTimeout(fn, delay)
}

/* =========================
   WATCH A SINGLE FOLDER
========================= */

function watchFolder(folder, type) {

  if (!fs.existsSync(folder)) {
    console.warn(`[Watcher] Folder not found, skipping: ${folder}`)
    return
  }

  fs.watch(folder, (event, filename) => {

    if (!filename) return

    const ext = path.extname(filename).toLowerCase()

    if (type === "policies" && ext !== ".docx") return
    if (type === "cis" && ext !== ".pdf") return

    const filePath = path.join(folder, filename)

    debounce(`${type}:${filename}`, async () => {

      if (fs.existsSync(filePath)) {

        console.log(`[Watcher] New/updated file detected: ${filename}`)

        try {
          removeDocumentVectors(filename)
          const count = await ingestFile(filePath, filename, type)
          reloadVectors()
          console.log(`[Watcher] Indexed ${filename} (${count} chunks)`)
        } catch (err) {
          console.error(`[Watcher] Failed to index ${filename}:`, err.message)
        }

      } else {

        console.log(`[Watcher] File removed: ${filename}`)
        removeDocumentVectors(filename)

      }

    })

  })

  console.log(`[Watcher] Watching: ${folder}`)

}

/* =========================
   START ALL WATCHERS
========================= */

function startWatcher() {
  watchFolder(POLICY_FOLDER, "policies")
  watchFolder(CIS_FOLDER, "cis")
}

module.exports = { startWatcher }
