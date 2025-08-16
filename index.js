// DEPENDENCIES
const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();
const app = express();
const port = process.env.LOCAL_SERVER_PORT || 5000;
const stripe = require("stripe")(process.env.STRIPE_KEY);
var admin = require("firebase-admin");
var serviceAccount = require("./firebaseAdminkey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// MIDDLEWARE
const corsOptions = {
  // change here 
  //  http://localhost:5000
  // origin: "http://localhost:5000",
  // origin: "http://localhost:5173",
  // http://localhost:5173/
  origin: "https://assignmet-12-5e8a8.web.app",
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json());

// MongoDB connection URI from .env
const uri = `mongodb+srv://${process.env.USER_NAME}:${process.env.DB_PASSWORD}@cluster12.horh8vt.mongodb.net/?retryWrites=true&w=majority&appName=Cluster12`;
// Create MongoDB client
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Main async function
async function run() {
  try {
    // Connect to MongoDB
    const db = client.db("fitnessTracker");
    const userCollection = db.collection("users");
    const subsCriptions = db.collection("subscriptions");
    const paymentCollection = db.collection("payments");
    const beAtrainerCollection = db.collection("beatrainer");
    const forumsCollection = db.collection("forumsCollection");
    const reviewCollecton = db.collection("reviews");
    const classesCollection = db.collection("classes");
    const reviewsCollectionf = db.collection("reviews");

    // TEST ROUTE
    app.get("/", (req, res) => {
      res.send("Hello World");
    });

    const verifyToken = async (req, res, next) => {
      try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
          return res.status(401).json({
            message: "Unauthorized Access - Missing or Invalid Token",
          });
        }

        const token = authHeader.split(" ")[1];
        const decoded = await admin.auth().verifyIdToken(token);
        if (!decoded) {
          return res.status(403).json({
            message: "Forbidden - Token verification failed",
          });
        }

        req.decoded = decoded;
        next();
      } catch (error) {
        console.error("Token verification error:", error);
        return res.status(403).json({
          message: "Forbidden - Invalid or expired token",
          error: error.message,
        });
      }
    };

   

    // PATCH /api/single-trainer/:id
    app.patch("/api/single-trainer/:id", async (req, res) => {
      const { id } = req.params;

      try {
        const result = await trainersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "rejected" } }
        );

        if (result.modifiedCount > 0) {
          res
            .status(200)
            .json({ message: "Trainer status updated to rejected." });
        } else {
          res
            .status(404)
            .json({ error: "Trainer not found or already rejected." });
        }
      } catch (error) {
        console.error("Error updating status:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // reviews collection
    app.post("/reviews", async (req, res) => {
      try {
        const review = req.body;
        if (
          !review ||
          !review.trainerId ||
          !review.userEmail ||
          !review.rating
        ) {
          return res.status(400).send({ error: "Invalid review data" });
        }

        review.createdAt = new Date();
        const result = await reviewsCollectionf.insertOne(review);
        res.send({ success: true, insertedId: result.insertedId });
      } catch (err) {
        console.error("Review error:", err);
        res.status(500).send({ error: "Failed to submit review" });
      }
    });
    app.post("/reviewsaddmany", async (req, res) => {
      try {
        const review = req.body;
        review.createdAt = new Date();
        const result = await reviewsCollectionf.insertMany(review);
        res.send({ success: true, insertedId: result.insertedId });
      } catch (err) {
        console.error("Review error:", err);
        res.status(500).send({ error: "Failed to submit review" });
      }
    });
    app.get("/reviews", async (req, res) => {
      const resutl = await reviewsCollectionf.find().toArray();
      return res.send(resutl);
    });
    // delete all reviews
    app.delete("/reviews", async (req, res) => {
      const resutl = await reviewsCollectionf.deleteMany({});
      return res.send(resutl);
    });

    // rejecttio
    // PATCH: Update trainer status and feedback
    app.patch("/single-trainer/:id", async (req, res) => {
      const id = req.params.id;
      const { status, email, feedback } = req.body;
      try {
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status,
            feedback: feedback || "",
          },
        };

        const trainerUpdate = await beAtrainerCollection.updateOne(
          query,
          updateDoc
        );

        await userCollection.updateOne(
          { email },
          { $set: { role: status === "approved" ? "trainer" : "member" } }
        );

        res.json({ success: true, trainerUpdate });
      } catch (error) {
        res
          .status(500)
          .json({ error: "Something went wrong", details: error.message });
      }
    });

    // *********** Classes Router ***********
    app.post("/classes", async (req, res) => {
      const classData = req.body;
      classData.createdAt = new Date();

      try {
        // Step 1: Insert into classesCollection
        const insertResult = await classesCollection.insertOne(classData);

        // Step 2: Build class info object to push into trainer documents
        const trainerClassInfo = {
          _id: insertResult.insertedId,
          category: classData.category,
          details: classData.details,
          image: classData.image,
          bookingCount: classData.bookingCount || 0,
          createdAt: classData.createdAt,
        };

        // Step 3: For each trainer in classData.trainers, update their record
        const updatePromises = classData.trainers.map(async (trainer) => {
          await userCollection.updateOne(
            { _id: new ObjectId(trainer._id) },
            {
              $addToSet: {
                classes: trainerClassInfo, // push the new class info into trainer's "classes" array
              },
            }
          );
        });

        // Step 4: Wait for all trainers to be updated
        await Promise.all(updatePromises);

        res.send({
          success: true,
          message: "Class added and trainers updated",
          insertedId: insertResult.insertedId,
        });
      } catch (err) {
        console.error("Error adding class:", err);
        res.status(500).send({ success: false, error: "Failed to add class" });
      }
    });

    app.post("/classesManyAdd", async (req, res) => {
      const classes = req.body;
      classes.createdAt = new Date();
      const result = await classesCollection.insertMany(classes);
      res.send(result);
    });

    app.get("/classes", async (req, res) => {
      const result = await classesCollection
        .find()
        .sort({ totalBookings: -1 })
        .limit(6)
        .toArray();
      res.json({ data: result.length, result: result });
    });

    app.get("/classesall", async (req, res) => {
      const result = await classesCollection.find().toArray();
      res.json({ data: result.length, result: result });
    });

    app.delete("/classes", async (req, res) => {
      const result = await classesCollection.deleteMany();
      res.send(result);
    });

    // finnd by category
    app.post("/api/trainers/add", async (req, res) => {
      const { category, trainers } = req.body;
      console.log(category, trainers);
    });

    // *********** Review Router Api *******
    app.post("/review", async (req, res) => {
      const data = req.body;
      const result = await reviewCollecton.insertOne(data);
      res.send(result);
    });

    app.get("/reviews", async (req, res) => {
      const result = await reviewCollecton.find().toArray();
      res.send(result);
    });

    // ********* Forum Route  **********
    app.post("/forumsmany", async (req, res) => {
      const forumData = req.body;
      const result = await forumsCollection.insertMany(forumData);
      res.send(result);
    });
    app.post("/forums", async (req, res) => {
      const forumData = req.body;
      const result = await forumsCollection.insertOne(forumData);
      res.send(result);
    });

    //  All forums
    app.get("/forums", async (req, res) => {
      try {
        const forums = await forumsCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();
        res.send(forums);
      } catch (err) {
        res.status(500).send({ error: "Failed to fetch forums" });
      }
    });

    // Single forum
    app.get("/forum/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await forumsCollection.find(query).toArray();
      res.send(result);
    });

    app.delete("/forumsAll", async (req, res) => {
      const result = await forumsCollection.deleteMany({});
      res.send(result);
    });
    // bote prodan

    app.patch("/forums/:id/vote", async (req, res) => {
      const { id } = req.params;
      const { email, type } = req.body;

      const query = { _id: new ObjectId(id) };

      try {
        const forum = await forumsCollection.findOne(query);
        if (!forum) return res.status(404).send({ message: "Forum not found" });

        const up = forum.votes?.up || [];
        const down = forum.votes?.down || [];

        let updatedVotes = { up, down };

        const alreadyLiked = up.includes(email);
        const alreadyDisliked = down.includes(email);

        if (type === "up") {
          if (alreadyLiked) {
            updatedVotes.up = up.filter((e) => e !== email);
          } else {
            updatedVotes.up = [...up, email];
            updatedVotes.down = down.filter((e) => e !== email);
          }
        } else if (type === "down") {
          if (alreadyDisliked) {
            updatedVotes.down = down.filter((e) => e !== email);
          } else {
            updatedVotes.down = [...down, email];
            updatedVotes.up = up.filter((e) => e !== email);
          }
        }

        await forumsCollection.updateOne(query, {
          $set: {
            votes: updatedVotes,
          },
        });

        const updatedForum = await forumsCollection.findOne(query);

        res.send(updatedForum);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // *********** Trainer Route *********

    //  apply trainer
    app.post("/beatrainer", async (req, res) => {
      try {
        const trainerData = req.body;
        trainerData.createdAt = new Date();
        trainerData.status = "pending";
        const result = await beAtrainerCollection.insertOne(trainerData);
        res.send({
          acknowledged: result.acknowledged,
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Trainer application failed:", error);
        res.status(500).send({ error: "Failed to submit trainer application" });
      }
    });

    //  get all trainer
    app.get("/all-trainers", async (req, res) => {
      const result = await beAtrainerCollection.find().toArray();
      res.json({ trainers: result.length, data: result });
    });

    // pending trainers
    app.get("/pending-trainers", async (req, res) => {
      try {
        const query = { status: "pending" };
        const pendingTrainers = await beAtrainerCollection
          .find(query)
          .toArray();
        res.send(pendingTrainers);
      } catch (error) {
        console.error("Failed to fetch pending trainers:", error);
        res.status(500).send({ error: "Internal server error" });
      }
    });

    // pending trainers
    app.get("/approved-trainers", async (req, res) => {
      try {
        const query = { status: "approved" };
        const pendingTrainers = await beAtrainerCollection
          .find(query)
          .toArray();
        res.send(pendingTrainers);
      } catch (error) {
        console.error("Failed to fetch pending trainers:", error);
        res.status(500).send({ error: "Internal server error" });
      }
    });
    // single trainers
    app.get("/single-trainer/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };

        const trainer = await beAtrainerCollection.findOne(query);

        if (!trainer) {
          return res.status(404).send({ message: "Trainer not found" });
        }

        res.send(trainer);
      } catch (error) {
        console.error("Error fetching trainer by ID:", error.message);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    //  approve and reject trainers
    app.patch("/single-trainer/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { status, email } = req.body;

        if (!status || !email) {
          return res
            .status(400)
            .json({ message: "Status and email are required" });
        }
        const query = { _id: new ObjectId(id) };
        // 1. Update trainer status
        const updateTrainerStatus = await beAtrainerCollection.updateOne(
          query,
          {
            $set: { status: status },
          }
        );

        // 2. Update user role if approved
        let updateUserRoleResult = { modifiedCount: 0 };
        if (status.toLowerCase() === "approved") {
          updateUserRoleResult = await userCollection.updateOne(
            { email: email },
            { $set: { role: "trainer" } }
          );
        }

        // 3. Response
        res.status(200).json({
          message: `Trainer status updated to '${status}'`,
          trainerUpdate: updateTrainerStatus.modifiedCount,
          userRoleUpdated: updateUserRoleResult.modifiedCount,
        });
      } catch (error) {
        console.error("Error updating trainer and user:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // 3 deleate all trainers
    app.delete("/beatrainer", async (req, res) => {
      try {
        const result = await beAtrainerCollection.deleteMany({});
        res.status(200).json({
          message: "All trainers deleted successfully",
          deletedCount: result.deletedCount,
        });
      } catch (error) {
        console.error("Error deleting trainers:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    // get all delete trainers
    app.get("/deleted-trainers", async (req, res) => {
      try {
        const query = { status: "rejected" };
        const deletedTrainers = await beAtrainerCollection
          .find(query)
          .toArray();

        res.status(200).json(deletedTrainers);
      } catch (error) {
        console.error("Error fetching deleted trainers:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    // my booking
    app.get("/mybooking", async (req, res) => {
      const email = req.query.email;

      if (!email) {
        return res.status(400).send({ error: "Email query is required" });
      }

      try {
        const query = { userEmail: email };
        const bookings = await db.collection("payments").find(query).toArray();

        res.send(bookings);
      } catch (error) {
        console.error("Failed to fetch bookings:", error);
        res.status(500).send({ error: "Internal server error" });
      }
    });

    // Balance Related api
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      if (!price || price <= 0) {
        return res.status(400).send({ error: "Invalid price" });
      }

      const amount = price * 100;

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        console.error("Payment Intent Error:", error);
        res.status(500).send({ error: "Failed to create payment intent" });
      }
    });
    // Save payment history on the database
    app.post("/payment",verifyToken, async (req, res) => {
      try {
        const { targetId, ...payment } = req.body;
        console.log("targetId", targetId);
        if (!payment || !payment.transactionId) {
          return res.status(400).send({ error: "Invalid payment data" });
        }

        payment.createdAt = new Date();
        payment.status = "paid";

        const result = await paymentCollection.insertOne(payment);

        // update booking count of the trainer/class
        await classesCollection.updateOne(
          { _id: new ObjectId(targetId) },
          { $inc: { bookingCount: 1 } }
        );

        res.send({
          success: true,
          message: "Payment & bookingCount updated successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Payment Save Error:", error);
        res.status(500).send({ error: "Failed to save payment" });
      }
    });

    //  all payment
    app.get("/payment", verifyToken, async (req, res) => {
      const result = await paymentCollection.find().toArray();
      res.send(result);
    });

    // *********** Subscription Route  *********
    app.post("/subscriptions", async (req, res) => {
      const subscriptions = req.body;
      const result = await subsCriptions.insertOne(subscriptions);
      res.send(result);
    });
    app.get("/subscriptions", async (req, res) => {
      const result = await subsCriptions.find().toArray();
      res.send(result);
    });

    // ************** USER ROUTE ***********
    // Save user information in the database
    app.post("/user", async (req, res) => {
      try {
        const user = req.body;
        user.createdAt = new Date();
        // Check if user already exists by email
        const existingUser = await userCollection.findOne({
          email: user.email,
        });

        if (existingUser) {
          return res.status(409).json({
            success: false,
            message: "User already exists with this email.",
          });
        }

        // Insert new user
        const result = await userCollection.insertOne(user);
        res.status(201).json({
          success: true,
          message: "User registered successfully.",
          userId: result.insertedId,
        });
      } catch (error) {
        console.error("Error saving user:", error);
        res.status(500).json({
          success: false,
          message: "Internal Server Error",
        });
      }
    });
    // deleate all users
    app.delete("/users", async (req, res) => {
      const result = await userCollection.deleteMany({});
      res.send(result);
    });
    // all users in the data base
    app.get("/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get("/user", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await userCollection.find(query).toArray();
      res.send(result);
    });

    // Confirm MongoDB connection
    console.log("Connected to MongoDB Succesfull");
  } catch (err) {
    console.error(" MongoDB connection error:", err);
  }
}

// Start the Express server
app.listen(port, () => {
  console.log(`Server running at: http://localhost:${port}`);
});
run().catch(console.dir);
