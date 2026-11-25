const mammoth = require("mammoth")
const { PDFParse } = require("pdf-parse")
const fs = require("fs")

async function extractTextFromDocx(filePath){

try{

const result = await mammoth.extractRawText({
path:filePath
})

return result.value

}catch(error){

console.error("DOCX read error:",error)

return ""

}

}

async function extractTextFromPdf(filePath){

try{

const buffer = fs.readFileSync(filePath)

const parser = new PDFParse({ data: new Uint8Array(buffer) })

const result = await parser.getText()

return result.text

}catch(error){

console.error("PDF read error:",error.message)

return ""

}

}

module.exports = {
extractTextFromDocx,
extractTextFromPdf
}