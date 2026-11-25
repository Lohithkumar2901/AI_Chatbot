const jwt = require("jsonwebtoken")
const jwksClient = require("jwks-rsa")

const tenantId = process.env.AZURE_TENANT_ID
const clientId = process.env.AZURE_CLIENT_ID

const client = jwksClient({
jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`
})

function getKey(header, callback) {

client.getSigningKey(header.kid, function (err, key) {

if(err){
console.log("Key fetch error:",err)
return callback(err)
}

const signingKey = key.publicKey || key.rsaPublicKey

callback(null, signingKey)

})

}

function verifyAzureToken(req,res,next){

const authHeader = req.headers.authorization

if(!authHeader){

console.log("Token missing")

return res.status(401).json({
error:"Token missing"
})

}

const token = authHeader.split(" ")[1]

jwt.verify(
token,
getKey,
{
audience: `api://${process.env.AZURE_CLIENT_ID}`,
issuer: [
`https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/v2.0`,
`https://sts.windows.net/${process.env.AZURE_TENANT_ID}/`
],
algorithms:["RS256"]
},
(err,decoded)=>{

if(err){

console.log("Token verification failed:",err.message)

return res.status(401).json({
error:"Invalid token"
})

}

req.user = decoded

const userEmail =
decoded.preferred_username ||
decoded.upn ||
decoded.email ||
decoded.name ||
decoded.oid ||
"unknown"

console.log("User authenticated:", userEmail)

req.user = {
email: userEmail,
name: decoded.name,
id: decoded.oid
}

next()

})

}

module.exports = verifyAzureToken