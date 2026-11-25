require("dotenv").config({ path: require("path").join(__dirname, "../.env") })

const fs = require("fs")
const path = require("path")

const { generateEmbedding } = require("../services/embeddingService")
const { extractTextFromPdf } = require("../services/documentService")
const { chunkText } = require("../utils/textChunker")

const CIS_FOLDER = path.join(__dirname, "../../data/CIS")
const VECTOR_PATH = path.join(__dirname, "../../vector_db/embeddings.json")

async function ingestCIS() {

  const files = fs.readdirSync(CIS_FOLDER).filter(f => f.endsWith(".pdf"))

  // Load existing vectors so we don't re-index already indexed files
  let existing = []
  if (fs.existsSync(VECTOR_PATH)) {
    existing = JSON.parse(fs.readFileSync(VECTOR_PATH))
  }

  const indexedDocs = new Set(existing.map(v => v.document))

  let totalChunks = 0

  for (const file of files) {

    if (indexedDocs.has(file)) {
      console.log(`Already indexed, skipping: ${file}`)
      continue
    }

    const filePath = path.join(CIS_FOLDER, file)

    console.log(`\nProcessing: ${file}`)

    const text = await extractTextFromPdf(filePath)

    if (!text || !text.trim()) {
      console.warn(`No text extracted from ${file}, skipping`)
      continue
    }

    const chunks = chunkText(text)
    console.log(`  ${chunks.length} chunks to embed...`)

    let fileChunks = 0

    for (const chunk of chunks) {

      const embedding = await generateEmbedding(chunk)

      existing.push({
        document: file,
        type: "cis",
        text: chunk,
        embedding
      })

      fileChunks++

      if (fileChunks % 10 === 0) {
        process.stdout.write(`  ${fileChunks}/${chunks.length}\r`)
        // Save progress after every 10 chunks so partial work is not lost
        fs.writeFileSync(VECTOR_PATH, JSON.stringify(existing, null, 2))
      }

    }

    // Final save for this file
    fs.writeFileSync(VECTOR_PATH, JSON.stringify(existing, null, 2))

    console.log(`  Done: ${file} (${fileChunks} chunks)`)
    totalChunks += fileChunks

  }

  console.log(`\nCIS ingestion complete. Total new chunks: ${totalChunks}`)
  console.log("Restart the server to load the new vectors into memory.")

}

ingestCIS().catch(err => {
  console.error("Ingestion failed:", err)
  process.exit(1)
})
