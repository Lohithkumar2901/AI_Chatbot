require("dotenv").config()

const OpenAI = require("openai")

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

/* =========================
   PARSE STRUCTURED JSON
========================= */

function parseStructured(content) {
  try {
    const parsed = JSON.parse(content)
    return { answer: parsed.answer || "" }
  } catch {
    return { answer: content }
  }
}

/* =========================
   GENERATE ANSWER
   Uses proper message turns so
   follow-ups carry context naturally.
   Accepts learned examples from past
   interactions to improve over time.
========================= */

async function generateAnswer(question, contextChunks, history = [], policyName = "", learnedExamples = []) {

const context = contextChunks.map(c => c.text).join("\n\n")

const cleanPolicy = policyName
  ? policyName.replace(".docx","").replace(/sec\s*\d+[_.]?\d*/i,"").trim()
  : ""

/* Learned examples from past Q&As */
const learnedSection = learnedExamples.length
  ? "\n\nRelevant past interactions (use as reference):\n" +
    learnedExamples.map(e => `Q: ${e.question}\nA: ${e.answer}`).join("\n\n")
  : ""

const systemPrompt =
`You are the NOC Policy Assistant for the company.
Answer questions strictly using the provided policy context.
Be clear, specific, and professional.
When the user asks for more detail or a follow-up, expand on what was previously discussed.
${cleanPolicy ? `Current policy: ${cleanPolicy}.` : ""}`

/* Context message — sent once before the conversation turns */
const contextMessage =
`Policy Context:
${context}${learnedSection}`

/* Build the messages array:
   system → context → conversation history → current question */
const messages = [
  { role: "system", content: systemPrompt },
  { role: "user",   content: contextMessage },
  { role: "assistant", content: "Understood. I will answer using this policy context." }
]

/* Add prior turns so follow-ups work naturally */
for (const h of history.slice(-4)) {
  messages.push({ role: "user",      content: h.question })
  messages.push({ role: "assistant", content: h.answer   })
}

/* Current question */
messages.push({
  role: "user",
  content: `${question}\n\nRespond with a valid JSON object with one key:\n- "answer": a clear professional markdown response`
})

const completion = await openai.chat.completions.create({
  model: "gpt-4.1",
  messages,
  response_format: { type: "json_object" }
})

return parseStructured(completion.choices[0].message.content)

}

/* =========================
   GENERATE CIS ANSWER
   Pure CIS query — explains what
   the CIS benchmark says without
   comparing to any company policy.
========================= */

async function generateCisAnswer(question, cisChunks) {

const context = cisChunks.map(c => c.text).join("\n\n")

const messages = [
  {
    role: "system",
    content:
`You are a cybersecurity expert explaining CIS benchmark controls and recommendations.
Answer only from the provided CIS benchmark content.
Be specific about control numbers, levels (L1/L2), and implementation guidance where available.
Always respond with a valid JSON object.`
  },
  {
    role: "user",
    content:
`CIS Benchmark Content:
${context}

Question: ${question}

Respond with a valid JSON object with one key:
- "answer": a clear professional markdown explanation covering what the benchmark recommends, why it matters, and how to implement it`
  }
]

const completion = await openai.chat.completions.create({
  model: "gpt-4.1",
  messages,
  response_format: { type: "json_object" }
})

return parseStructured(completion.choices[0].message.content)

}

/* =========================
   GENERATE CIS COMPARISON
   Explicit compare: company policy
   vs CIS benchmark controls.
========================= */

async function generateComparison(question, policyChunks, cisChunks) {

const policyContext = policyChunks.map(c => c.text).join("\n\n")
const cisContext    = cisChunks.map(c => c.text).join("\n\n")

const messages = [
  {
    role: "system",
    content:
`You are a cybersecurity policy analyst comparing company policies against CIS benchmark controls.
Provide structured, actionable comparisons.
Always respond with a valid JSON object.`
  },
  {
    role: "user",
    content:
`Company Policy:
${policyContext}

CIS Benchmark:
${cisContext}

Question: ${question}

Respond with a valid JSON object with one key:
- "answer": a detailed professional markdown comparison using these headings:
  ## What Our Policy Says
  ## What CIS Recommends
  ## Gaps & Alignment
  ## Recommendations`
  }
]

const completion = await openai.chat.completions.create({
  model: "gpt-4.1",
  messages,
  response_format: { type: "json_object" }
})

return parseStructured(completion.choices[0].message.content)

}

module.exports = { generateAnswer, generateCisAnswer, generateComparison }
