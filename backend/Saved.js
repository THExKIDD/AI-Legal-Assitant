const mongoose = require("mongoose");

const savedSchema = new mongoose.Schema({

    question: String,

    answer: String,

    source: String,

    userId: {
        type: String,
        default: null
    },

    date: {
        type: Date,
        default: Date.now
    }

});

const Saved = mongoose.model(
    "Saved",
    savedSchema
);

module.exports = Saved;