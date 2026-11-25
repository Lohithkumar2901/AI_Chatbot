const { generateEmbedding } = require("../services/embeddingService");
const { loadVectors, searchVectors } = require("../services/vectorService");

async function test() {
  loadVectors();

  const question = "What is backup retention policy?";

  const embedding = await generateEmbedding(question);

  const results = searchVectors(embedding, 3);

  console.log("Top results:");
  console.log(results);
}

test();