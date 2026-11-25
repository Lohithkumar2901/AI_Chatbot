const userSecurity = {}

function checkLock(userID){

if(!userSecurity[userID]){

userSecurity[userID] = {
invalidCount:0,
lockUntil:null
}

}

const user = userSecurity[userID]

if(user.lockUntil && Date.now() < user.lockUntil){

return {
locked:true,
remaining:Math.ceil((user.lockUntil - Date.now())/1000)
}

}

return {locked:false}

}

function registerInvalidQuery(userID){

if(!userSecurity[userID]){
userSecurity[userID] = {invalidCount:0,lockUntil:null}
}

const user = userSecurity[userID]

user.invalidCount++

if(user.invalidCount >= 5){

user.lockUntil = Date.now() + (5 * 60 * 1000)
user.invalidCount = 0

return true
}

return false
}

function resetInvalidCount(userID){

if(userSecurity[userID]){
userSecurity[userID].invalidCount = 0
}

}

module.exports = {
checkLock,
registerInvalidQuery,
resetInvalidCount
}