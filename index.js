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
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// =====================================
// JWT Configuration & Middleware
// =====================================
const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`)
);

const verifyToken = async (req, res, next) => {
  const authHeader = req?.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const { payload } = await jwtVerify(token, JWKS);
    console.log("Token Verified Payload:", payload);
    req.user = payload; 
    next();
  } catch (error) {
    res.status(403).json({ message: "Forbidden" });
  }
};

// =====================================
// MongoDB Routes Connection
// =====================================
async function run() {
  try {
   
    const db = client.db("bloodsync");
    
  
    const bloodRequestsCollection = db.collection("blood-data");       
    const myDonationsCollection = db.collection("myDonations"); 
    const donationApplicationsCollection = db.collection("donationApplications");

    console.log("Pinged your deployment. You successfully connected to MongoDB!");

    // ===============================
    // 🩸 BLOOD REQUESTS API ROUTES 
    // ==============================

    // Search by bloodGroup, Filter, Sort (FIXED FOR YOUR MONGODB SCHEMA)
    app.get('/blood-requests', async (req, res) => {
      try {
        const { search, bloodGroup, urgency } = req.query;
        let query = {};

        
        if (search && search.trim() !== "") {
          query.$or = [
            { hospitalName: { $regex: search, $options: 'i' } },
            { patientName: { $regex: search, $options: 'i' } }
          ];
        }

      
        if (bloodGroup && bloodGroup !== 'All Groups' && bloodGroup !== 'All' && bloodGroup.trim() !== "") {
          const groupArray = bloodGroup.split(',');
          query.bloodGroup = { $in: groupArray };
        }

        
        if (urgency && urgency !== 'all' && urgency.trim() !== "") {
          query.urgency = { $regex: `^${urgency}$`, $options: 'i' }; 
        }

        
        let sortOptions = { _id: -1 }; 

        const result = await bloodRequestsCollection.find(query).sort(sortOptions).toArray();
        res.json(result);
      } catch (error) {
        res.status(500).json({ message: "Error fetching blood requests", error: error.message });
      }
    });

  //  ===========================
  // ===============================
// 🩸 UPDATED BLOOD REQUEST ROUTE
// ===============================


app.get('/donation-request/:id', async (req, res) => {
  try {
    const id = req.params.id;
    
    
    const request = await bloodRequestsCollection.findOne({ _id: new ObjectId(id) });
    
    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }
    
    res.json(request);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});
// ===========================
// Add Blood Request Form Data
    app.post('/create-request', verifyToken, async (req, res) => {
      try {
        const requestData = req.body;
        console.log("Creating new blood request:", requestData);
        const result = await bloodRequestsCollection.insertOne(requestData);
        res.json(result);
      } catch (error) {
        res.status(500).json({ message: "Error inserting blood request", error: error.message });
      }
    });
    
    // ================++++===============


   
    

    

    
    

   
   


    
    // ================++++===============

  } catch (error) {
    console.error("Database error:", error);
  }
}

run().catch(console.dir);

// Base Route
app.get('/', (req, res) => {
    res.send('BloodSync Server is running smoothly!')
});

// Server Listener
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
});
