const { generateEmbedding } = require("../services/embeddingService");
const { loadVectors, searchVectors } = require("../services/vectorService");
const { generateAnswer } = require("../services/aiService");

async function test() {

  /* Load vector database */
  loadVectors();

  /* User Question */
  const question = "what is file transfer policy and steps for file transfer";

  /* Convert question to embedding */
  const queryEmbedding = await generateEmbedding(question);

  /* Retrieve multiple candidate chunks */
  const results = searchVectors(queryEmbedding, 4);

  /* Group chunks by document */
  const docMap = new Map();

  results.forEach(r => {

    if (!docMap.has(r.document)) {
      docMap.set(r.document, {
        type: r.type,
        texts: []
      });
    }

    docMap.get(r.document).texts.push(r.text);

  });

  /* Select maximum 2 documents */
  const selectedDocs = [...docMap.entries()].slice(0, 2);

  /* Build context for AI */
  let contextChunks = [];

  selectedDocs.forEach(([doc, data]) => {

    const combinedText = data.texts.join("\n\n");

    contextChunks.push({
      document: doc,
      type: data.type,
      text: combinedText
    });

  });

  /* Generate final AI answer */
  const answer = await generateAnswer(question, contextChunks);

  console.log("\nAnswer:\n");
  console.log(answer);

  console.log("\nSources:\n");

  /* Print unique document sources */
  contextChunks.forEach(r => {

    const folder = r.type === "policies"
      ? "data/policies"
      : "data/sops";

    const filePath = `${folder}/${r.document}`;

    console.log(`Document: ${r.document}`);
    console.log(`Download: ${filePath}`);
    console.log("");

  });

}

test();