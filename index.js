const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require('express');
const dotenv = require('dotenv');
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");

dotenv.config();

const uri = process.env.MONGODB_URI;
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true, }
});

// গ্লোবাল ভেরিয়েবল হিসেবে রাখুন যাতে সব রাউট অ্যাক্সেস করতে পারে
let bloodRequestsCollection;

// JWT Middleware
const JWKS = createRemoteJWKSet(new URL(`${process.env.CLIENT_URL}/api/auth/jwks`));

const verifyToken = async (req, res, next) => {
  const authHeader = req?.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "Unauthorized" });
  const token = authHeader.split(" ")[1];
  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload; 
    next();
  } catch (error) {
    res.status(403).json({ message: "Forbidden" });
  }
};

// ডাটাবেস কানেকশন
async function run() {
  try {
    await client.connect();
    const db = client.db("bloodsync");
    bloodRequestsCollection = db.collection("blood-data");
    console.log("Connected to MongoDB!");
  } catch (error) {
    console.error("Database error:", error);
  }
}
run();

// =====================================
// API ROUTES
// =====================================

app.get('/blood-requests', async (req, res) => {
  try {
    const result = await bloodRequestsCollection.find({}).toArray();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/my-requests', async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) return res.status(400).json({ message: "Email required" });
    const result = await bloodRequestsCollection.find({ requesterEmail: email }).toArray();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/create-request', verifyToken, async (req, res) => {
  try {
    const result = await bloodRequestsCollection.insertOne(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/blood-request/:id', verifyToken, async (req, res) => {
  try {
    const result = await bloodRequestsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
