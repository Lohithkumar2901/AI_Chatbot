const fs = require("fs");
const path = require("path");

const VECTOR_PATH = path.join(__dirname, "../../vector_db/embeddings.json");

let vectors = [];

/* Load embeddings into memory once */
function loadVectors() {
  if (!fs.existsSync(VECTOR_PATH)) {
    console.error("Vector database not found.");
    return;
  }

  const raw = fs.readFileSync(VECTOR_PATH);
  vectors = JSON.parse(raw);

  console.log(`Loaded ${vectors.length} vector chunks`);
}

function saveVector(vector) {
  const existing = fs.existsSync(VECTOR_PATH)
    ? JSON.parse(fs.readFileSync(VECTOR_PATH))
    : [];

  existing.push(vector);

  fs.writeFileSync(VECTOR_PATH, JSON.stringify(existing, null, 2));

  vectors.push(vector);
}

function reloadVectors() {
  if (!fs.existsSync(VECTOR_PATH)) {
    vectors = [];
    return;
  }

  const raw = fs.readFileSync(VECTOR_PATH);
  vectors = JSON.parse(raw);

  console.log(`Reloaded ${vectors.length} vector chunks`);
}

function removeDocumentVectors(documentName) {
  vectors = vectors.filter(v => v.document !== documentName);

  if (fs.existsSync(VECTOR_PATH)) {
    const all = JSON.parse(fs.readFileSync(VECTOR_PATH));
    const filtered = all.filter(v => v.document !== documentName);
    fs.writeFileSync(VECTOR_PATH, JSON.stringify(filtered, null, 2));
  }

  console.log(`Removed vectors for: ${documentName}`);
}

function searchVectorsByType(queryEmbedding, type, topK = 5) {
  const filtered = vectors.filter(v => v.type === type);

  const scores = filtered.map(item => ({
    similarity: cosineSimilarity(queryEmbedding, item.embedding),
    document: item.document,
    type: item.type,
    text: item.text
  }));

  scores.sort((a, b) => b.similarity - a.similarity);

  return scores.slice(0, topK);
}

function getIndexedDocuments() {
  return [...new Set(vectors.map(v => v.document))];
}

/* Cosine similarity */
function cosineSimilarity(vecA, vecB) {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    magA += vecA[i] * vecA[i];
    magB += vecB[i] * vecB[i];
  }

  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);

  return dot / (magA * magB);
}

/* Search most similar chunks */
function searchVectors(queryEmbedding, topK = 3) {
  const scores = vectors.map(item => {
    const similarity = cosineSimilarity(queryEmbedding, item.embedding);

    return {
      similarity,
      document: item.document,
      type: item.type,
      text: item.text
    };
  });

  scores.sort((a, b) => b.similarity - a.similarity);

  return scores.slice(0, topK);
}

module.exports = {
  loadVectors,
  reloadVectors,
  saveVector,
  removeDocumentVectors,
  searchVectors,
  searchVectorsByType,
  getIndexedDocuments
};