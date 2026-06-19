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

   
    app.get('/my-donations', async(req, res) => {
      try {
        const result = await myDonationsCollection.find().toArray();
        res.json(result);
      } catch (error) {
        res.status(500).json({ message: "Error fetching donation history", error: error.message });
      }
    });

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

   
    app.get('/blood-request/:id', verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid ID format" });
        }
        const query = { _id: new ObjectId(id) };
        let request = await bloodRequestsCollection.findOne(query);

        if (!request) {
          return res.status(404).json({ message: "Blood request not found" });
        }
        res.json(request);
      } catch (error) {
        res.status(500).json({ message: "Error fetching request details", error: error.message });
      }
    });

    app.put('/blood-request/:id', verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid ID format" });
        }

        const query = { _id: new ObjectId(id) };
        const body = req.body;

        console.log("Updating blood request id:", id);
     
        const updateDoc = {
          $set: {
            patientName: body.patientName || "",
            bloodGroup: body.bloodGroup || "",
            bagsCount: body.bagsCount ? Number(body.bagsCount) : 1,
            hospitalName: body.hospitalName || "",
            donationDate: body.donationDate || "",
            contactNumber: body.contactNumber || "",
            description: body.description || "",
            status: body.status || "Pending"
          }
        };

        const result = await bloodRequestsCollection.updateOne(query, updateDoc);

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Request not found to update" });
        }

        res.json({ success: true, message: "Blood request updated successfully", result });
      } catch (error) {
        console.error("Backend error updating request:", error);
        res.status(500).json({ message: "Server error updating request details", error: error.message });
      }
    });

    
    app.delete('/blood-request/:id', verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid ID format" });
        }

        const query = { _id: new ObjectId(id) };
        const result = await bloodRequestsCollection.deleteOne(query);

        if (result.deletedCount === 0) {
          return res.status(404).json({ message: "Request not found to delete" });
        }

        res.json({ success: true, message: "Blood request deleted successfully", result });
      } catch (error) {
        console.error("Backend error deleting request:", error);
        res.status(500).json({ message: "Server error deleting blood request", error: error.message });
      }
    });

    // ==========================================
    // 💌 DONATION APPLICATIONS / RESPONSES ROUTES
    // ==========================================

    // I want to donate here
    app.post('/donate-blood', async (req, res) => {
      try {
        const applicationData = req.body;
        const result = await donationApplicationsCollection.insertOne({
          requestId: applicationData.requestId,
          patientName: applicationData.patientName,
          donorName: applicationData.donorName,
          donorEmail: applicationData.donorEmail,
          donorPhone: applicationData.donorPhone,
          applicationDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), 
          status: "Pending", 
          message: applicationData.message || ""
        });

        res.status(201).json({ success: true, message: "Donation response submitted successfully!", result });
      } catch (error) {
        console.error("Error saving donation application:", error);
        res.status(500).json({ success: false, message: "Server error saving response" });
      }
    });

   
    app.get('/my-requests', async (req, res) => {
      try {
        const { email, requestId } = req.query;
        let query = {};
        
        if (email) {
          query.donorEmail = email; 
        }
        if (requestId) {
          query.requestId = requestId; 
        }

        const result = await donationApplicationsCollection.find(query).toArray();
        res.json(result);
      } catch (error) {
        console.error("Error fetching applications:", error);
        res.status(500).json({ message: "Server error fetching applications" });
      }
    });

    
    app.patch('/change-status/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body; 

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid ID format" });
        }

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: { status: status },
        };

        const result = await donationApplicationsCollection.updateOne(filter, updateDoc);
        
        if (result.modifiedCount > 0 || result.matchedCount > 0) {
          res.json({ success: true, message: "Donation status updated successfully!" });
        } else {
          res.status(404).json({ success: false, message: "Application not found" });
        }
      } catch (error) {
        console.error("Error updating status:", error);
        res.status(500).json({ success: false, message: "Server error updating status" });
      }
    });

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
// ================

app.get('/donation-request/:id', verifyToken, async (req, res) => {
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