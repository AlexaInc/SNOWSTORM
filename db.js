const mongoose = require('mongoose');
const { MONGO_URL } = require('./config');

const userSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, default: "Survivor" },
    points: { type: Number, default: 500 },
    wins: { type: Number, default: 0 },
    kills: { type: Number, default: 0 },
    inventory: { type: Map, of: Number, default: {} },
    equipped_skills: { type: [String], default: [] }
});

const User = mongoose.model('User', userSchema);

async function connectDB() {
    if (!MONGO_URL) return false;
    try {
        await mongoose.connect(MONGO_URL);
        console.log("✅ Connected to MongoDB!");
        return true;
    } catch (error) {
        console.error("❌ MongoDB connection error:", error.message);
        return false;
    }
}

module.exports = { User, connectDB };
