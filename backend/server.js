require("dotenv").config()

const express = require("express")
const cors = require("cors")
const path = require("path")
const fs = require("fs")

const { loadVectors } = require("./services/vectorService")
const { syncDocuments } = require("./services/ingestService")
const { startWatcher } = require("./services/watcherService")
const chatController = require("./controllers/chatController")

const verifyAzureToken = require("./middleware/verifyAzureToken")

const app = express()

/* =========================
CORS
========================= */

app.use(cors({
origin:["https://wil-chatbot.wheelsindia.com","http://172.16.11.243:3001","http://localhost:3001"],
methods:["GET","POST"],
credentials:true
}))

/* =========================
BODY PARSER
========================= */

app.use(express.json())
app.use(express.urlencoded({extended:true}))

/* =========================
SERVE FRONTEND
========================= */

app.use(express.static(path.join(__dirname,"../frontend")))

/* =========================
LOAD VECTOR DB + SYNC NEW FILES
========================= */

loadVectors()

/* Ingest any new files added since last run, runs in background */
syncDocuments().catch(err => console.error("[Sync] Error:", err.message))

/* Watch data folders for file changes — no restart needed */
startWatcher()

/* =========================
CHAT API (Protected — Azure)
========================= */

app.post(
"/api/chat",
verifyAzureToken,
chatController.chat
)

/* =========================
CHAT API (Internal — DRILL portal)
Uses a shared secret instead of Azure AD
========================= */

const INTERNAL_SECRET = process.env.INTERNAL_SECRET

app.post("/api/chat/internal", (req, res) => {
  if (!INTERNAL_SECRET) {
    return res.status(503).json({ error: "Internal endpoint not configured" })
  }
  const auth = req.headers.authorization
  if (!auth || auth !== `Bearer ${INTERNAL_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" })
  }
  req.user = { email: "drill-portal@internal", name: "ISMS Portal" }
  return chatController.chat(req, res)
})

/* =========================
DOCUMENT DOWNLOAD
========================= */

app.get("/documents/policies/:name",(req,res)=>{

/* basename() blocks path traversal such as ..%2F..%2Fbackend%2F.env */
const fileName = path.basename(req.params.name)

const filePath = path.join(
__dirname,
"../data/policies",
fileName
)

if(fs.existsSync(filePath)){
res.download(filePath)
}else{
res.status(404).send("Document not found")
}

})

app.get("/api/user", verifyAzureToken, (req, res) => {

const name = req.user?.name || req.user?.email || "User"

res.json({
name
})

})

/* =========================
ADMIN SYNC (Protected)
Triggers re-indexing of new
files without a server restart
========================= */

app.post("/api/admin/sync", verifyAzureToken, async (req,res)=>{

try{

const { syncDocuments } = require("./services/ingestService")

console.log("[Admin] Manual sync triggered by:", req.user?.email)

const count = await syncDocuments()

res.json({
status:"ok",
newFilesIndexed: count
})

}catch(err){

console.error("[Admin] Sync error:", err.message)

res.status(500).json({ error: err.message })

}

})

/* =========================
HEALTH CHECK
========================= */

app.get("/health",(req,res)=>{
res.json({
status:"running",
service:"NOC Policy Chatbot"
})
})

const PORT = process.env.PORT || 3000

app.listen(PORT,"0.0.0.0",()=>{
console.log(`Server running on port ${PORT}`)
})