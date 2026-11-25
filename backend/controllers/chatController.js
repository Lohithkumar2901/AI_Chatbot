const fs = require("fs")
const path = require("path")

const { generateEmbedding } = require("../services/embeddingService")
const { searchVectorsByType } = require("../services/vectorService")
const { generateAnswer, generateComparison, generateCisAnswer } = require("../services/aiService")
const { saveQA, findSimilarQA } = require("../services/learnService")

const {
  checkLock,
  registerInvalidQuery,
  resetInvalidCount
} = require("../utils/securityManager")

/* =========================
   POLICY FILES
========================= */

const policyFolder = path.join(__dirname,"../../data/policies")

let policyFiles = []

try{
policyFiles = fs.readdirSync(policyFolder)
}catch(err){
console.error("Policy folder missing")
}

const policyTitles = policyFiles.map(file=>({
file,
title:file
.replace(".docx","")
.replace(/sec\s*\d+[_\.]?\d*/i,"")
.toLowerCase()
}))

/* =========================
   USER SESSION MEMORY
========================= */

const userSessions = {}

/* =========================
   LOGGING
========================= */

function writeLog(data){
try{
const logDir = path.join(__dirname,"../../logs")
if(!fs.existsSync(logDir)) fs.mkdirSync(logDir,{recursive:true})
const date = new Date().toISOString().split("T")[0]
fs.appendFileSync(path.join(logDir,`chat-${date}.log`), JSON.stringify(data)+"\n")
}catch(err){
console.error("Log write failed:",err.message)
}
}

/* =========================
   POLICY INTENT
========================= */

function detectPolicyIntent(question){
const q = question.toLowerCase()
let bestMatch = null, bestScore = 0
for(const policy of policyTitles){
let score = 0
for(const w of policy.title.split(" ")){
if(w.length > 2 && q.includes(w)) score++
}
if(score > bestScore){ bestScore = score; bestMatch = policy.file }
}
return bestScore >= 1 ? bestMatch : null
}

/* =========================
   INTENT DETECTION
========================= */

/*
  CIS COMPARISON — user explicitly wants to compare
  company policy against CIS (requires comparison verb)
*/
function isCisComparison(question){
const q = question.toLowerCase()
if(!q.includes("cis")) return false
return (
q.includes("compare") ||
q.includes("versus") ||
q.includes(" vs ") ||
q.includes("against") ||
q.includes("align") ||
q.includes("gap") ||
q.includes("difference") ||
q.includes("differ") ||
q.includes("measure") ||
(q.includes("policy") && q.includes("cis"))
)
}

/*
  CIS QUERY — user just wants CIS info, no comparison
  e.g. "cis benchmark for linux", "what does cis say about passwords"
*/
function isCisQuery(question){
return question.toLowerCase().includes("cis") && !isCisComparison(question)
}

/*
  FOLLOW-UP — short or vague query that continues the
  previous response (e.g. "summary", "tell me more",
  "explain that", "what does that mean")
*/
function isFollowUp(question){
const q = question.toLowerCase().trim()
const keywords = ["summary","summarize","explain","more","details",
"clarify","elaborate","expand","tell me more","what about",
"go deeper","brief","overview","recap"]
// Short single-word or follow-up keyword
if(q.split(" ").length <= 2 && keywords.some(w=>q.includes(w))) return true
if(keywords.some(w=>q===w)) return true
return false
}

/* =========================
   SHOW POLICY
========================= */

function isShowPolicy(question){
const q = question.toLowerCase()
return(
q.includes("show policy")||
q.includes("view policy")||
q.includes("download policy")||
q.includes("open policy")
)
}

/* =========================
   RERANKER
========================= */

function rerank(question,chunks){
const q = question.toLowerCase()
return chunks.map(chunk=>{
let score = 0
const text = chunk.text.toLowerCase()
q.split(" ").forEach(w=>{ if(w.length>2 && text.includes(w)) score++ })
return {...chunk,score}
}).sort((a,b)=>b.score-a.score)
}

/* =========================
   CHAT CONTROLLER
========================= */

async function chat(req,res){

try{

const userEmail = req.user?.email || "unknown"
const question = req.body.question
const history = req.body.history || []

if(!question) return res.status(400).json({error:"Question required"})

const userID = userEmail

/* LOCK CHECK */
const lock = checkLock(userID)
if(lock.locked){
writeLog({time:new Date(),user:userEmail,question,status:"LOCKED"})
return res.json({answer:`⚠ Chatbot locked. Try again in ${lock.remaining} seconds.`,sources:[],locked:true})
}

/* SESSION INIT */
if(!userSessions[userID]){
userSessions[userID]={
lastPolicy:null,
lastAnswerPolicy:null,
lastAnswer:"",
lastQueryType:null,   // "policy" | "cis" | "comparison"
lastQuestion:""
}
}
const session = userSessions[userID]

/* SHOW POLICY DOWNLOAD */
if(isShowPolicy(question)){
if(session.lastAnswerPolicy){
writeLog({time:new Date(),user:userEmail,question,policy:session.lastAnswerPolicy,status:"POLICY_DOWNLOAD"})
return res.json({
answer:`Here is the ${session.lastAnswerPolicy.replace(".docx","")} document.`,
sources:[`/documents/policies/${encodeURIComponent(session.lastAnswerPolicy)}`]
})
}
return res.json({answer:"Please ask about a policy first.",sources:[]})
}

/* POLICY DETECTION */
const detected = detectPolicyIntent(question)
if(detected) session.lastPolicy = detected

/* EMBEDDING */
const queryEmbedding = await generateEmbedding(question)

/* ==========================================
   FOLLOW-UP ROUTING
   "summary", "tell me more", etc. after
   any previous response — route back to
   the same handler that answered last time.
========================================== */

if(isFollowUp(question) && session.lastQueryType){

if(session.lastQueryType === "cis"){
// Re-run the last CIS question with the follow-up as context
const combinedQ = `${question} of: ${session.lastQuestion}`
const cisEmbed  = await generateEmbedding(combinedQ)
const cisResults = searchVectorsByType(cisEmbed,"cis",10)

if(cisResults.length && cisResults[0].similarity >= 0.20){
const cisChunks = rerank(combinedQ, cisResults).slice(0,4).map(r=>({document:r.document,text:r.text}))
const { answer } = await generateCisAnswer(combinedQ, cisChunks)
writeLog({time:new Date(),user:userEmail,question,status:"CIS_FOLLOWUP"})
return res.json({ answer, sources:[] })
}
}

if(session.lastQueryType === "policy" && session.lastPolicy){
// Fall through to policy flow below — session.lastPolicy ensures
// the right document is used. Just skip the relevance gate.
}
}

/* ==========================================
   CIS-ONLY QUERY
   User wants CIS info — no policy comparison
   e.g. "cis benchmark for linux"
========================================== */

if(isCisQuery(question)){

const cisResults = searchVectorsByType(queryEmbedding,"cis",10)

if(!cisResults.length || cisResults[0].similarity < 0.25){
return res.json({
answer:"CIS benchmark documents are not yet indexed. Ask an administrator to run document indexing.",
sources:[]
})
}

const cisChunks = rerank(question, cisResults).slice(0,4).map(r=>({document:r.document,text:r.text}))

const { answer } = await generateCisAnswer(question, cisChunks)

session.lastQueryType = "cis"
session.lastQuestion  = question

writeLog({time:new Date(),user:userEmail,question,status:"CIS_QUERY"})

return res.json({ answer, sources:[] })
}

/* POLICY VECTOR SEARCH */
let results = searchVectorsByType(queryEmbedding,"policies",15)

/* RELEVANCE CHECK
   Skip gate for policy follow-ups so "summary", "explain"
   etc. don't get rejected after a valid policy answer. */
const relevant = results.find(r=>r.similarity>=0.30)
const policyFollowUp = isFollowUp(question) && session.lastQueryType === "policy"

if(!relevant && !policyFollowUp){
const locked = registerInvalidQuery(userID)
writeLog({time:new Date(),user:userEmail,question,status:"IRRELEVANT"})
if(locked) return res.json({answer:"⚠ Too many irrelevant questions detected. Chatbot locked for 5 minutes.",sources:[],locked:true})
return res.json({answer:"Your query appears unrelated to company policies.",sources:[]})
}

/* ==========================================
   CIS COMPARISON
   User wants explicit policy vs CIS comparison
========================================== */

if(isCisComparison(question)){

const cisResults = searchVectorsByType(queryEmbedding,"cis",8)

if(!cisResults.length || cisResults[0].similarity < 0.25){
return res.json({
answer:"CIS benchmark documents are not yet indexed. Ask an administrator to run document indexing.",
sources:[]
})
}

const policyChunks = rerank(question, results).slice(0,3).map(r=>({document:r.document,text:r.text}))
const cisChunks = rerank(question, cisResults).slice(0,3).map(r=>({document:r.document,text:r.text}))

const { answer } = await generateComparison(question, policyChunks, cisChunks)

session.lastQueryType = "comparison"
session.lastQuestion  = question

writeLog({time:new Date(),user:userEmail,question,status:"CIS_COMPARISON"})

return res.json({ answer, sources:[] })
}

/* RERANK + PREFER ACTIVE POLICY */
results = rerank(question, results).slice(0,5)

if(session.lastPolicy){
const filtered = results.filter(r=>r.document===session.lastPolicy)
if(filtered.length>0) results = filtered
}

if(!results.length) return res.json({answer:"No relevant policy information found.",sources:[]})

/* ACTIVE POLICY */
const mainDoc = results[0].document
session.lastPolicy = mainDoc
session.lastAnswerPolicy = mainDoc

/* CONTEXT BUILD */
const contextChunks = results.slice(0,3).map(r=>({document:r.document,text:r.text}))

/* LEARNED EXAMPLES — find similar past Q&As */
const learnedExamples = findSimilarQA(queryEmbedding)

/* GENERATE ANSWER */
const { answer } = await generateAnswer(
question,
contextChunks,
history,
mainDoc,
learnedExamples
)

/* SAVE TO LEARN SERVICE */
saveQA(question, answer, queryEmbedding)

session.lastAnswer    = answer
session.lastQueryType = "policy"
session.lastQuestion  = question

resetInvalidCount(userID)

writeLog({time:new Date(),user:userEmail,question,policy:mainDoc,status:"SUCCESS"})

res.json({ answer, sources:[] })

}catch(error){
console.error("Chat Error:",error)
writeLog({time:new Date(),error:error.message,status:"ERROR"})
res.status(500).json({error:"Internal server error"})
}

}

module.exports = { chat }
