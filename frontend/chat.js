const chatMessages = document.getElementById("chatMessages")
const input = document.getElementById("questionInput")
const sendBtn = document.getElementById("sendBtn")

let chatHistory = []

sendBtn.onclick = sendQuestion

input.addEventListener("keypress",function(e){
if(e.key==="Enter"){
e.preventDefault()
sendQuestion()
}
})

/* =========================
   ENSURE LOGIN ON LOAD
========================= */

async function ensureLogin(){

try{

const accounts = msalInstance.getAllAccounts()

if(accounts.length === 0){

const loginResponse = await msalInstance.loginPopup({
scopes:["api://364fa563-2bab-4b57-a016-a8b8757eb259/access_as_user"]
})

msalInstance.setActiveAccount(loginResponse.account)

}else{

msalInstance.setActiveAccount(accounts[0])

}

}catch(err){

console.log("Login failed:",err)

}

}

/* =========================
   SEND QUESTION
========================= */

async function sendQuestion(){

const question = input.value.trim()

if(!question) return

addMessage(question,"user")

input.value=""

showLoading()

try{

const token = await getToken()

const response = await fetch("/api/chat",{
method:"POST",
headers:{
"Content-Type":"application/json",
"Authorization":"Bearer " + token
},
body:JSON.stringify({
question:question,
history:chatHistory
})
})

if(response.status === 401){

console.log("User not authenticated, requesting login")

await ensureLogin()

removeLoading()
return
}

const data = await response.json()

removeLoading()

addBotMessage(data.answer,data.sources)

chatHistory.push({
question:question,
answer:data.answer
})

if(chatHistory.length>3){
chatHistory.shift()
}

}catch(error){

removeLoading()

addBotMessage("Server error. Please try again.",[])

console.error(error)

}

}

/* =========================
   GREETING WITH USER NAME
========================= */

async function showGreeting(){

let username = "User"

try{

const token = await getToken()

const response = await fetch("/api/user",{
headers:{
"Authorization":"Bearer " + token
}
})

const data = await response.json()

if(data.name){
username = data.name.split(" ")[0]
}

}catch(err){

console.log("User fetch failed")

}

/* Date divider */
const today = new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})
const divider = document.createElement("div")
divider.className = "date-divider"
divider.innerHTML = `<span>${today}</span>`
chatMessages.appendChild(divider)

const greeting = `Hello **${username}** 👋

I'm the **NOC Policy Assistant**. I can help you with company policies, security guidelines, and CIS benchmark comparisons.`

addBotMessage(greeting,[])

addSuggestionButtons()

}

/* =========================
   SUGGESTIONS
========================= */

function addSuggestionButtons(){

const suggestions=[
"Password Policy",
"Backup Policy",
"Internet Policy",
"File Transfer Policy"
]

const container=document.createElement("div")
container.className="suggestions"

suggestions.forEach(text=>{

const btn=document.createElement("button")

btn.innerText=text

btn.onclick=()=>{
input.value=text
sendQuestion()
}

container.appendChild(btn)

})

chatMessages.appendChild(container)

}

/* =========================
   USER MESSAGE
========================= */

function addMessage(text,type){

const div=document.createElement("div")

div.className=`message ${type}`

div.innerHTML=`<div class="bubble">${text}</div>`

chatMessages.appendChild(div)

chatMessages.scrollTop=chatMessages.scrollHeight

}

/* =========================
   BOT MESSAGE
========================= */

const BOT_AVATAR_SVG=`<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 4l5 2.18V11c0 3.5-2.33 6.79-5 7.93-2.67-1.14-5-4.43-5-7.93V7.18L12 5z"/></svg>`

const DOC_ICON_SVG=`<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`

function addBotMessage(answer,sources){

let sourceHTML=""

if(sources && sources.length>0){

sources.forEach(src=>{

const name = decodeURIComponent(src.split("/").pop())

sourceHTML+=`
<div class="source">
<button class="docBtn" onclick="openDocument('${src}')">
${DOC_ICON_SVG} ${name}
</button>
</div>
`

})

}

const div=document.createElement("div")

div.className="message bot"

div.innerHTML=`
<div class="avatar">${BOT_AVATAR_SVG}</div>
<div class="bubble"><span class="typing"></span></div>
`

chatMessages.appendChild(div)

chatMessages.scrollTop=chatMessages.scrollHeight

const typingElement=div.querySelector(".typing")

if(!answer) answer="Sorry, something went wrong."

typeWords(answer,typingElement,()=>{

const bubble=div.querySelector(".bubble")

bubble.innerHTML=marked.parse(answer)+sourceHTML

chatMessages.scrollTop=chatMessages.scrollHeight

})

}

/* =========================
   WORD TYPING EFFECT
========================= */

function typeWords(text,element,callback){

const words=text.split(" ")

let index=0

function type(){

if(index<words.length){

element.innerHTML+=words[index]+" "

index++

chatMessages.scrollTop=chatMessages.scrollHeight

setTimeout(type,35)

}else{

if(callback) callback()

}

}

type()

}

/* =========================
   LOADING DOTS
========================= */

function showLoading(){

const div=document.createElement("div")

div.className="message bot"

div.id="loadingMessage"

div.innerHTML=`
<div class="avatar">${BOT_AVATAR_SVG}</div>
<div class="bubble">
<div class="loading-dots">
<span class="dot"></span>
<span class="dot"></span>
<span class="dot"></span>
</div>
</div>
`

chatMessages.appendChild(div)

chatMessages.scrollTop=chatMessages.scrollHeight

}

function removeLoading(){

const loading=document.getElementById("loadingMessage")

if(loading){
loading.remove()
}

}

/* =========================
   DOWNLOAD DOCUMENT
========================= */

function openDocument(path){

const link=document.createElement("a")

link.href=path

link.target="_blank"

document.body.appendChild(link)

link.click()

link.remove()

}

/* =========================
   INITIAL LOAD
========================= */

window.onload = async ()=>{

await ensureLogin()

await showGreeting()

}