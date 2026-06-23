const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require('express');
const dotenv = require('dotenv');
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
    origin: [process.env.CLIENT_URL, "https://bloodsync-client.vercel.app"], 
    credentials: true
}));
app.use(express.json());

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true, }
});

// JWT JWKS
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

// ডাটাবেস রান ফাংশন
async function run() {
  try {
    await client.connect();
    const db = client.db("bloodsync");
    
    // কালেকশনগুলো
    const bloodRequestsCollection = db.collection("blood-data");
    const usersCollection = db.collection("user");
    const donationsCollection = db.collection("donations");

    console.log("Connected to MongoDB!");

    // --- API ROUTES ---

    // রুট পাথ চেক
    app.get('/', (req, res) => {
        res.send('BloodSync Server is running perfectly!');
    });

    app.get('/blood-requests', async (req, res) => {
      const result = await bloodRequestsCollection.find({}).toArray();
      res.json(result);
    });

    app.get('/my-requests', async (req, res) => {
      const email = req.query.email;
      if (!email) return res.status(400).json({ message: "Email required" });
      const result = await bloodRequestsCollection.find({ requesterEmail: email }).toArray();
      res.json(result);
    });

    app.post('/create-request', verifyToken, async (req, res) => {
      const result = await bloodRequestsCollection.insertOne(req.body);
      res.json(result);
    });

    app.delete('/blood-request/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid ID" });
      const result = await bloodRequestsCollection.deleteOne({ _id: new ObjectId(id) });
      res.json(result);
    });

    app.patch('/update-user', verifyToken, async (req, res) => {
        const { name, image, district, upazila, bloodGroup } = req.body;
        const result = await usersCollection.updateOne(
            { email: req.user.email },
            { $set: { name, image, district, upazila, bloodGroup } }
        );
        res.json({ success: true, result });
    });

    app.get('/donation-request/:id', async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid ID" });
      const result = await bloodRequestsCollection.findOne({ _id: new ObjectId(id) });
      res.json(result);
    });

    app.post('/donate', verifyToken, async (req, res) => {
      const result = await donationsCollection.insertOne(req.body);
      res.json({ success: true, result });
    });

    // সার্ভার লিসেনিং
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

  } catch (error) {
    console.error("Database connection error:", error);
  }
}

run();