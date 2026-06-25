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
        // ====================
        // 🩸 Get Single Donor/User Details by ID 
        app.get('/api/users/:id', async (req, res) => {
            try {
                const id = req.params.id;
                if (!ObjectId.isValid(id)) {
                    return res.status(400).json({ message: "Invalid User ID format" });
                }
                const user = await usersCollection.findOne({ _id: new ObjectId(id) });
                if (!user) {
                    return res.status(404).json({ message: "User not found" });
                }
                res.json({ user });
            } catch (error) {
                console.error("Error fetching single user:", error);
                res.status(500).json({ message: "Internal Server Error" });
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
// ===================
app.patch('/admin/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body; // e.g. { role: "admin" } or { status: "BLOCKED" }
        
        const result = await client.db("bloodsync").collection("users").updateOne(
            { _id: new ObjectId(id) },
            { $set: updates }
        );
        res.json({ success: true, message: "User updated!" });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});
// ============
app.patch('/blood-data/donate/:id', async (req, res) => {
    try {
        const id = req.params.id;
      
        const { donorMessage, donorEmail, donorName } = req.body;

        if (!id || !ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid Blood Request ID format" });
        }

        
        const result = await bloodRequestsCollection.updateOne(
            { _id: new ObjectId(id) },
            {
                $set: {
                    status: "inprogress", 
                    donorName: donorName || "Anonymous Donor",
                    donorEmail: donorEmail || "donor@example.com",
                    donorMessage: donorMessage || "",
                    updatedAt: new Date()
                }
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ success: false, message: "Blood request not found" });
        }

        res.json({ success: true, message: "Blood data updated to inprogress successfully! 🎉" });

    } catch (error) {
        console.error("Error in blood-data donate:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
});


app.get('/api/my-donations', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) {
            return res.status(400).json({ message: "Email parameter is required" });
        }
        
        
        const result = await bloodRequestsCollection.find({ donorEmail: email }).toArray();
        res.json(result);
    } catch (error) {
        console.error("Error fetching donations:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});
// ===================
        
app.put('/api/public/donate/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const { donorMessage, donorEmail, donorName } = req.body;

        if (!id || !ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid ID format" });
        }

        if (!donorEmail) {
            return res.status(400).json({ success: false, message: "Donor email is required" });
        }

        const result = await client.db("bloodsync").collection("blood-data").updateOne(
            { _id: new ObjectId(id) },
            {
                $set: {
                    status: "inprogress",
                    donorName: donorName || "Anonymous Donor",
                    donorEmail: donorEmail,
                    donorMessage: donorMessage || "",
                    updatedAt: new Date()
                }
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ success: false, message: "Blood request not found" });
        }

        res.json({ success: true, message: "Blood data updated to inprogress successfully! 🎉" });

    } catch (error) {
        console.error("Error in public donate API:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
});

        // server listen
        app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

    } catch (error) {
        console.error("Database connection error:", error);
    }
}

run();
// -------------
