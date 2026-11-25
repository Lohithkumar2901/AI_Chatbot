require("dotenv").config();

module.exports = {
  openaiKey: process.env.OPENAI_API_KEY,
  dbHost: process.env.MYSQL_HOST
};