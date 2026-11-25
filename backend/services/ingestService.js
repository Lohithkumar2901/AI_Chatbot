const fs = require("fs")
const path = require("path")

const { generateEmbedding } = require("./embeddingService")
const {
  saveVector,
  removeDocumentVectors,
  getIndexedDocuments,
  reloadVectors
} = require("./vectorService")
const { extractTextFromDocx, extractTextFromPdf } = require("./documentService")
const { chunkText } = require("../utils/textChunker")

const POLICY_FOLDER = path.join(__dirname, "../../data/policies")
const CIS_FOLDER = path.join(__dirname, "../../data/CIS")

/* =========================
   INGEST A SINGLE FILE
========================= */

async function ingestFile(filePath, documentName, type) {

  let text = ""

  if (filePath.endsWith(".docx")) {
    text = await extractTextFromDocx(filePath)
  } else if (filePath.endsWith(".pdf")) {
    text = await extractTextFromPdf(filePath)
  } else {
    return 0
  }

  if (!text || !text.trim()) {
    console.warn(`[Ingest] No text extracted from ${documentName}`)
    return 0
  }

  const chunks = chunkText(text)

  for (const chunk of chunks) {
    const embedding = await generateEmbedding(chunk)
    saveVector({ document: documentName, type, text: chunk, embedding })
  }

  return chunks.length

}

/* =========================
   SYNC DATA FOLDERS
   Ingests new files, removes
   deleted files — no restart
========================= */

async function syncDocuments() {

  const indexed = new Set(getIndexedDocuments())

  const policyFiles = fs.existsSync(POLICY_FOLDER)
    ? fs.readdirSync(POLICY_FOLDER).filter(f => f.endsWith(".docx"))
    : []

  const cisFiles = fs.existsSync(CIS_FOLDER)
    ? fs.readdirSync(CIS_FOLDER).filter(f => f.endsWith(".pdf"))
    : []

  const allFiles = [
    ...policyFiles.map(f => ({ name: f, path: path.join(POLICY_FOLDER, f), type: "policies" })),
    ...cisFiles.map(f => ({ name: f, path: path.join(CIS_FOLDER, f), type: "cis" }))
  ]

  const currentNames = new Set(allFiles.map(f => f.name))

  /* Remove vectors for deleted files */
  for (const indexedName of indexed) {
    if (!currentNames.has(indexedName)) {
      console.log(`[Sync] Removing deleted file: ${indexedName}`)
      removeDocumentVectors(indexedName)
    }
  }

  /* Ingest new files */
  let newCount = 0

  for (const file of allFiles) {
    if (!indexed.has(file.name)) {
      console.log(`[Sync] Ingesting new file: ${file.name}`)
      try {
        const count = await ingestFile(file.path, file.name, file.type)
        console.log(`[Sync] Indexed ${file.name} (${count} chunks)`)
        newCount++
      } catch (err) {
        console.error(`[Sync] Failed to ingest ${file.name}:`, err.message)
      }
    }
  }

  if (newCount > 0) {
    reloadVectors()
    console.log(`[Sync] Complete — ${newCount} new file(s) indexed`)
  } else {
    console.log("[Sync] No new files to index")
  }

  return newCount

}

module.exports = { ingestFile, syncDocuments }
