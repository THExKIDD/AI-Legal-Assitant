const mongoose = require("mongoose");

const chatSchema = new mongoose.Schema({

    question: String,

    answer: String,

    source: String,

    userId: {
        type: String,
        default: null
    },

    feedback: {
        type: String,
        default: ""
    },

    date: {
        type: Date,
        default: Date.now
    }

});

const Chat = mongoose.model(
    "Chat",
    chatSchema
);

module.exports = Chat;