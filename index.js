require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
// const morgan = require("morgan");

const port = process.env.PORT || 5000;
const app = express();
// middleware
const corsOptions = {
  origin: ["http://localhost:5173", "http://localhost:5174"],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(cookieParser());
// app.use(morgan("dev"));

const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err);
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.user = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hqlh5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    // DataBase
    const db = client.db("Plant-Net");
    const usersCollection = db.collection("users");
    const plantsCollection = db.collection("plants");
    const ordersCollection = db.collection("orders");

    // Generate jwt token
    app.post("/jwt", async (req, res) => {
      const email = req.body;
      const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "365d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });
    // Logout
    app.get("/logout", async (req, res) => {
      try {
        res
          .clearCookie("token", {
            maxAge: 0,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          })
          .send({ success: true });
      } catch (err) {
        res.status(500).send(err);
      }
    });
    // Save or Update
    app.post("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const query = { email: email };
      // Checking user already exists
      const isExist = await usersCollection.findOne(query);
      if (isExist) {
        return res.send(isExist);
      }
      const result = await usersCollection.insertOne({
        ...user,
        role: "customer",
        timestamp: Date.now(),
      });
      res.send(result);
    });
    // Save plant to the DB
    app.post("/plants", async (req, res) => {
      const plant = req.body;
      const result = await plantsCollection.insertOne(plant);
      res.send(result);
    });
    // Get All Plant from DB
    app.get("/plants", async (req, res) => {
      const result = await plantsCollection.find().toArray();
      res.send(result);
    });

    // Get a plant by id
    app.get("/plant/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await plantsCollection.findOne(query);
      res.send(result);
    });

    // Save order data in DB
    app.post("/order", async (req, res) => {
      const orderInfo = req.body;
      const result = await ordersCollection.insertOne(orderInfo);
      res.send(result);
    });
    // Manage Quantity
    app.patch("/plants/quantity/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const { quantityToUpdate, status } = req.body;
      const filter = { _id: new ObjectId(id) };
      let updateDoc = {
        $inc: { quantity: -quantityToUpdate },
      };
      if (status === "increase") {
        updateDoc = {
          $inc: { quantity: quantityToUpdate },
        };
      }
      const result = await plantsCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // Get all customer orders for a specific users
    app.get("/customer-orders/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { "customer.email": email };
      const result = await ordersCollection
        .aggregate([
          {
            $match: query, // Match specific data by email
          },
          {
            $addFields: {
              plantId: { $toObjectId: "$plantId" }, // convert  plantId (string) to object id
            },
          },
          {
            // Go to another collection for look data
            $lookup: {
              from: "plants",
              localField: "plantId",
              foreignField: "_id",
              as: "plant",
            },
          },
          {
            $unwind: "$plant", // To remove the array
          },
          {
            // Add this field only in order object
            $addFields: {
              name: "$plant.name",
              image: "$plant.image",
              category: "$plant.category",
            },
          },
          {
            // remove plant object only
            $project: {
              plant: 0,
            },
          },
        ])
        .toArray();
      console.log(result);
      res.send(result);
    });
    // cancle an order
    app.delete("/orders/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const order = await ordersCollection.findOne(query);
      if (order.status === "Delivered") {
        return res
          .status(409)
          .send("Cannot cancle once the product is delivered");
      }
      const result = await ordersCollection.deleteOne(query);
      res.send(result);
    });
    // Send a ping to confirm a successful connection
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello from plantNet Server..");
});

app.listen(port, () => {
  console.log(`plantNet is running on port ${port}`);
});
