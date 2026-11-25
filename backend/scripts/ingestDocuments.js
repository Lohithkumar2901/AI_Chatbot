const fs = require("fs")
const path = require("path")

const { generateEmbedding } = require("../services/embeddingService")
const { saveVector } = require("../services/vectorService")
const { extractTextFromDocx } = require("../services/documentService")
const { chunkText } = require("../utils/textChunker")

const POLICY_FOLDER = path.join(__dirname, "../../data/policies")

async function ingest(){

const files = fs.readdirSync(POLICY_FOLDER)

for(const file of files){

const filePath = path.join(POLICY_FOLDER,file)

console.log(`Processing ${file}...`)

const text = await extractTextFromDocx(filePath)

const chunks = chunkText(text)

for(const chunk of chunks){

const embedding = await generateEmbedding(chunk)

saveVector({
document:file,
type:"policies",
text:chunk,
embedding
})

}

console.log(`Indexed ${file}`)

}

console.log("Policy ingestion complete.")

}

ingest()