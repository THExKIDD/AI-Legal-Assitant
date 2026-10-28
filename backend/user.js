
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },

    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },

    password: {
        type: String,
        required: true
    },

    // Rolling window question tracking (resets every 4 hours)
    windowQuestionsUsed: {
        type: Number,
        default: 0
    },

    // Timestamp when the current 4-hour window started
    windowStart: {
        type: Date,
        default: null
    },

    // Set to true once user completes a (mock) premium purchase
    isPremium: {
        type: Boolean,
        default: false
    },

    // When the current monthly subscription period expires (null = no active plan)
    premiumExpiresAt: {
        type: Date,
        default: null
    }
});

const User = mongoose.model("User", userSchema);

module.exports = User;
