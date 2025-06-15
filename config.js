const path = require("path");
require('dotenv').config();

const isPackaged = process.pkg != null;
const sessionPath = isPackaged
? path.join(process.cwd(), "firebase-service-account-key.json")  // For packaged executable
: path.join(__dirname, "firebase-service-account-key.json");    // For development



// credential: require(path.join(__dirname, "firebase-service-account-key.json"))

module.exports = {
  PORT: process.env.PORT || 3100,
  API_URL: process.env.API_URL || "https://aiiiiiiiii.onrender.com",
  mainToken: process.env.MAIN_TOKEN || "tNmxk654vaak7gG1kuZH",
  firebaseConfig: {
    credential: sessionPath
  }
};