const msalConfig = {
auth:{
clientId:"364fa563-2bab-4b57-a016-a8b8757eb259",
authority:"https://login.microsoftonline.com/6f3490a2-b3a6-4ce5-ad92-168d3089f968",
redirectUri:"https://wil-chatbot.wheelsindia.com"
}
}

const msalInstance = new msal.PublicClientApplication(msalConfig)

/* Initialize account if already logged in */

const accounts = msalInstance.getAllAccounts()

if(accounts.length > 0){
msalInstance.setActiveAccount(accounts[0])
}

/* Login */



/* Get token */

async function getToken(){

let account = msalInstance.getActiveAccount()

if(!account){

const accounts = msalInstance.getAllAccounts()

if(accounts.length > 0){

account = accounts[0]
msalInstance.setActiveAccount(account)

}else{

const loginResponse = await msalInstance.loginPopup({
scopes:["openid","profile","email"]
})

account = loginResponse.account
msalInstance.setActiveAccount(account)

}

}

const tokenResponse = await msalInstance.acquireTokenSilent({
scopes:["api://364fa563-2bab-4b57-a016-a8b8757eb259/access_as_user"],
account:account
})

return tokenResponse.accessToken

}