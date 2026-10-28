const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
require("dotenv").config();

const mongoose = require("mongoose");
const dns = require("dns");

try {
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
} catch (e) {
  // Ignore
}

const MONGO_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/legalassistant";

console.log("Connecting to MongoDB URI:", MONGO_URI.replace(/:[^:@]+@/, ":****@"));

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("MongoDB Connected Successfully to Atlas!");
  })
  .catch((error) => {
    console.error("MongoDB Connection Error:", error.message);
  });
