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


async function run() {
  try {
    await client.connect();
    const db = client.db("bloodsync");
    
    // connection
    const bloodRequestsCollection = db.collection("blood-data");
    const usersCollection = db.collection("user");
    const donationsCollection = db.collection("donations");

    console.log("Connected to MongoDB!");

    // --- API ROUTES ---

    // root path
    app.get('/', (req, res) => {
        res.send('BloodSync Server is running perfectly!');
    });

    app.get('/blood-requests', async (req, res) => {
    try {
        const { search, bloodGroup, urgency } = req.query;
        let query = {};
       
        if (search) {
            query.$or = [
                { hospitalName: { $regex: search, $options: 'i' } },
                { location: { $regex: search, $options: 'i' } }
            ];
        }
      
        if (bloodGroup && bloodGroup !== "All Groups") {
            query.bloodGroup = bloodGroup;
        }
        
        if (urgency && urgency !== "all") {
            query.urgency = urgency;
        }

        
        const result = await bloodRequestsCollection.find(query).toArray();
        res.json(result);
    } catch (error) {
        res.status(500).json({ message: "Error filtering requests" });
    }
});

    // ========================
    
    app.get('/donors', async (req, res) => {
        try {
           
            const result = await usersCollection.find({}).toArray();
            res.json(result);
        } catch (error) {
            console.error("Error fetching donors:", error);
            res.status(500).json({ message: "Server Error while fetching donors" });
        }
    });
    // =============
    app.get('/donations', async (req, res) => {
    try {
        const result = await donationsCollection.find({}).toArray();
        res.json(result);
    } catch (error) {
        res.status(500).json({ message: "Server Error" });
    }
});

  // Dashboard-total funding
app.get('/total-funding', verifyToken, async (req, res) => {
    try {
        const result = await donationsCollection.aggregate([
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: { $toDouble: "$amount" } } // amount String থাকলে $toDouble ব্যবহার করুন
                }
            }
        ]).toArray();
        
        const total = result.length > 0 ? result[0].totalAmount : 0;
        res.json({ total });
    } catch (error) {
        res.status(500).json({ message: "Error calculating total funding" });
    }
});


    // ==========================
    
app.get('/my-requests', verifyToken, async (req, res) => {
    try {
        
        const email = req.user.email; 
        
        
        const result = await bloodRequestsCollection.find({ requesterEmail: email }).toArray();
        
        res.json(result);
    } catch (error) {
        res.status(500).json({ message: "Error fetching data" });
    }
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

    // server listen
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

  } catch (error) {
    console.error("Database connection error:", error);
  }
}

run();
// -------------
