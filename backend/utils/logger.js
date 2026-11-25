const fs = require("fs")

function logEvent(event){

const date = new Date().toISOString().split("T")[0]

const file = `logs/chatbot-${date}.log`

fs.appendFileSync(file, JSON.stringify(event)+"\n")

}
module.exports = { logEvent }