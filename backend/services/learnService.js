const fs = require("fs")
const path = require("path")

const LEARNED_PATH = path.join(__dirname, "../../vector_db/learned_qa.json")

const MAX_ENTRIES    = 1000   // max stored Q&A pairs
const MATCH_THRESHOLD = 0.88  // cosine similarity to be considered "similar"
const UPDATE_THRESHOLD = 0.95 // cosine similarity to be considered "same question"

/* In-memory cache — loaded once, updated on each save */
let learnedQA = null

/* =========================
   COSINE SIMILARITY
========================= */

function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  return denom === 0 ? 0 : dot / denom
}

/* =========================
   LOAD FROM DISK
========================= */

function load() {
  if (learnedQA !== null) return learnedQA
  if (!fs.existsSync(LEARNED_PATH)) {
    learnedQA = []
    return learnedQA
  }
  try {
    learnedQA = JSON.parse(fs.readFileSync(LEARNED_PATH))
  } catch {
    learnedQA = []
  }
  return learnedQA
}

/* =========================
   SAVE Q&A PAIR
   Called after every successful answer.
   If the same question was asked before
   (similarity > 0.95), the answer is
   refreshed. Otherwise a new entry is added.
========================= */

function saveQA(question, answer, embedding) {

  if (!answer || answer.length < 40) return

  const db = load()

  /* Update if near-identical question already exists */
  for (const entry of db) {
    if (cosineSimilarity(embedding, entry.embedding) >= UPDATE_THRESHOLD) {
      entry.answer    = answer.slice(0, 800)
      entry.updatedAt = new Date().toISOString()
      persist(db)
      return
    }
  }

  /* Add new entry */
  db.push({
    question,
    answer:    answer.slice(0, 800),
    embedding,
    createdAt: new Date().toISOString()
  })

  /* Trim to max size (keep most recent) */
  if (db.length > MAX_ENTRIES) db.splice(0, db.length - MAX_ENTRIES)

  persist(db)
}

/* =========================
   FIND SIMILAR Q&As
   Returns past Q&As whose question
   embedding is close to this query.
   These are injected into the AI prompt
   so the bot improves with usage.
========================= */

function findSimilarQA(queryEmbedding, topK = 2) {

  const db = load()
  if (!db.length) return []

  return db
    .map(entry => ({ ...entry, sim: cosineSimilarity(queryEmbedding, entry.embedding) }))
    .filter(e => e.sim >= MATCH_THRESHOLD)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, topK)
    .map(e => ({ question: e.question, answer: e.answer }))
}

/* =========================
   PERSIST TO DISK
========================= */

function persist(db) {
  try {
    fs.writeFileSync(LEARNED_PATH, JSON.stringify(db))
  } catch (err) {
    console.error("[Learn] Persist failed:", err.message)
  }
}

module.exports = { saveQA, findSimilarQA }
