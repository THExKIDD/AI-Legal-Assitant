const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const db = require("./database");

const Chat = require("./Chat");
const User = require("./user");
const Saved = require("./Saved");

const app = express();
const PORT = process.env.PORT || 5000;
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";

app.use(cors());
app.use(express.json());


app.get("/", (req, res) => {

    res.send("Backend is working");

});

app.get("/db-health", (req, res) => {
    const states = ["disconnected", "connected", "connecting", "disconnecting"];
    const readyState = mongoose.connection.readyState;
    res.json({
        status: states[readyState] || "unknown",
        connected: readyState === 1,
        readyState: readyState,
        uriConfigured: Boolean(process.env.MONGODB_URI),
        platform: process.platform,
        error: db.getLastError ? db.getLastError() : null
    });
});


const GUEST_FREE_LIMIT = 3;
const GUEST_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4-hour cooldown for guests
const guestRateLimits = new Map();

// ── Logged-in user rolling window limits ──────────────────────────────────────
const USER_WINDOW_LIMIT   = 10;                  // 10 free questions per window
const USER_WINDOW_MS      = 4 * 60 * 60 * 1000; // 4-hour rolling window
const MAX_PROMPT_CHARS    = 1500;                // Max characters per prompt (like Claude's context limit)

app.post("/chat", async (req, res) => {

    const question = req.body.question;
    const userId = req.body.userId || null;
    const isUserLoggedIn = Boolean(userId);
    const saveChat = isUserLoggedIn && req.body.save_chat !== false;
    let userUsage = null;

    // Condition 1: When user is not logged in, AI gives normal standard answer
    const is_detailed = isUserLoggedIn ? Boolean(req.body.is_detailed) : false;

    // ── Prompt length check (applies to ALL users, like Claude context limit) ──
    if (question && question.length > MAX_PROMPT_CHARS) {
        console.log(`[PROMPT TOO LONG] ${question.length} chars (limit: ${MAX_PROMPT_CHARS})`);
        return res.status(413).json({
            prompt_too_long: true,
            prompt_length: question.length,
            max_length: MAX_PROMPT_CHARS,
            message: `Your prompt is too long (${question.length} characters). Please shorten it to under ${MAX_PROMPT_CHARS} characters to continue.`
        });
    }

    // ── Logged-in user: rolling 4-hour free-plan window check ─────────────────
    if (isUserLoggedIn) {
        const dbUser = await User.findById(userId);
        if (!dbUser) {
            return res.status(401).json({ message: "User not found. Please log in again." });
        }

        // Check if premium subscription is still active
        const premiumActive = dbUser.isPremium && dbUser.premiumExpiresAt && new Date() < new Date(dbUser.premiumExpiresAt);

        // If premium expired, reset the flag
        if (dbUser.isPremium && !premiumActive) {
            await User.findByIdAndUpdate(userId, { isPremium: false, premiumExpiresAt: null });
        }

        if (!premiumActive) {
            const now = Date.now();
            const windowStart = dbUser.windowStart ? new Date(dbUser.windowStart).getTime() : 0;
            const windowAge   = now - windowStart;

            // If the 4-hour window has expired, reset it
            if (windowAge >= USER_WINDOW_MS) {
                await User.findByIdAndUpdate(userId, {
                    windowQuestionsUsed: 0,
                    windowStart: new Date(now)
                });
                // Reload fresh state
                dbUser.windowQuestionsUsed = 0;
                dbUser.windowStart = new Date(now);
            }

            if (dbUser.windowQuestionsUsed >= USER_WINDOW_LIMIT) {
                const resetAt    = windowStart + USER_WINDOW_MS;
                const waitMs     = Math.max(0, resetAt - now);
                const waitSecs   = Math.ceil(waitMs / 1000);
                const waitMins   = Math.floor(waitSecs / 60);
                const waitHrs    = Math.floor(waitMins / 60);
                const remMins    = waitMins % 60;
                console.log(`[USER WINDOW LIMIT] User ${userId} hit ${USER_WINDOW_LIMIT}-question limit. Resets in ${waitHrs}h ${remMins}m.`);
                return res.status(429).json({
                    user_limit_exceeded: true,
                    window_questions_used: dbUser.windowQuestionsUsed,
                    window_limit: USER_WINDOW_LIMIT,
                    wait_seconds: waitSecs,
                    reset_time: resetAt,
                    message: `You have used all ${USER_WINDOW_LIMIT} free questions for this window. Please wait ${waitHrs}h ${remMins}m or upgrade to Premium for unlimited access.`
                });
            }

            // Increment window counter (start window if first question)
            const nextQuestionCount = dbUser.windowQuestionsUsed + 1;
            const update = { $inc: { windowQuestionsUsed: 1 } };
            if (!dbUser.windowStart || nextQuestionCount >= USER_WINDOW_LIMIT) {
                update.windowStart = new Date(now);
            }
            await User.findByIdAndUpdate(userId, update);
            userUsage = {
                used: nextQuestionCount,
                limit: USER_WINDOW_LIMIT,
                remaining: Math.max(0, USER_WINDOW_LIMIT - nextQuestionCount),
                reset_time: nextQuestionCount >= USER_WINDOW_LIMIT
                    ? now + USER_WINDOW_MS
                    : null
            };
        }
    }

    // ── Guest rate limit (3 questions, then 4-hour wait) ──────────────────────
    let clientIp = "guest_client";
    if (!isUserLoggedIn) {
        clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "guest_client";
        const now = Date.now();
        let record = guestRateLimits.get(clientIp);

        if (!record || now > record.resetTime) {
            record = {
                count: 0,
                resetTime: now + GUEST_COOLDOWN_MS
            };
            guestRateLimits.set(clientIp, record);
        }

        if (record.count >= GUEST_FREE_LIMIT) {
            const waitSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
            console.log(`[RATE LIMIT] Guest limit reached (${GUEST_FREE_LIMIT} questions). Must wait ${waitSeconds}s.`);

            return res.status(429).json({
                limit_exceeded: true,
                wait_seconds: waitSeconds,
                reset_time: record.resetTime,
                limit: GUEST_FREE_LIMIT,
                message: `Free guest limit reached (${GUEST_FREE_LIMIT} questions). Please wait ${Math.floor(waitSeconds / 3600)}h ${Math.floor((waitSeconds % 3600) / 60)}m or create an account for ${USER_WINDOW_LIMIT} free questions every 4 hours.`
            });
        }

        record.count += 1;
        if (record.count >= GUEST_FREE_LIMIT) {
            record.resetTime = now + GUEST_COOLDOWN_MS;
        }
        console.log(`[GUEST USAGE] Question ${record.count} of ${GUEST_FREE_LIMIT} for IP ${clientIp}`);
    }

    console.log(
        "Question received:",
        question,
        "is_detailed (normal for guests):",
        is_detailed,
        "save_chat:",
        saveChat
    );

    try {

        const response = await axios.post(
            `${AI_SERVICE_URL}/ask`,
            {
                question: question,
                is_detailed: is_detailed
            }
        );

        const answer =
            response.data.answer;

        const source =
            response.data.source;

        console.log(
            "Answer received:",
            answer ? answer.slice(0, 100) + "..." : "No answer"
        );

        let savedChatId = null;

        if (saveChat) {
            const newChat = new Chat({
                question: question,
                answer: answer,
                source: source,
                userId: userId
            });

            await newChat.save();
            savedChatId = newChat._id;

            console.log(
                "Chat saved to MongoDB for user:",
                userId
            );
        } else {
            console.log(
                "Guest mode: Normal answer returned without saving to MongoDB"
            );
        }

        const guestRecord = !isUserLoggedIn ? guestRateLimits.get(clientIp) : null;

        res.json({
            _id: savedChatId,
            answer: answer,
            source: source,
            saved: Boolean(savedChatId),
            is_detailed: is_detailed,
            user_usage: userUsage,
            guest_usage: guestRecord ? {
                used: guestRecord.count,
                limit: GUEST_FREE_LIMIT,
                remaining: Math.max(0, GUEST_FREE_LIMIT - guestRecord.count),
                reset_time: guestRecord.resetTime
            } : null
        });

    } catch (error) {

        console.log(
            "ERROR:",
            error.response?.data ||
            error.message
        );

        res.status(500).json({

            answer:
                "Something went wrong.",

            source: "",
            saved: false

        });

    }

});


app.get("/history", async (req, res) => {

    try {

        const userId = req.query.userId;

        // If guest or no userId provided, don't return history (guest mode)
        if (!userId) {
            return res.json([]);
        }

        const chats =
            await Chat.find({ userId }).sort({
                date: -1
            });

        res.json(chats);

    } catch (error) {

        res.status(500).json({

            message:
                "Cannot load chat history"

        });

    }

});

app.delete("/history/:id", async (req, res) => {
    try {
        const { userId } = req.query;
        const { id } = req.params;

        if (!userId) {
            return res.status(400).json({ message: "userId required" });
        }

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid chat id" });
        }

        const deletedChat = await Chat.findOneAndDelete({ _id: id, userId });
        if (!deletedChat) {
            return res.status(404).json({ message: "Chat not found" });
        }

        return res.json({ success: true });
    } catch (error) {
        console.log("DELETE CHAT ERROR:", error.message);
        return res.status(500).json({ message: "Cannot delete chat history" });
    }
});


app.post("/saved", async (req, res) => {

    try {

        const question =
            req.body.question;

        const answer =
            req.body.answer;

        const source =
            req.body.source;

        const userId =
            req.body.userId;

        if (!userId) {
            return res.status(401).json({
                requireLogin: true,
                message: "Please log in to save answers to your MongoDB account."
            });
        }

        const alreadySaved =
            await Saved.findOne({
                question: question,
                answer: answer,
                userId: userId
            });


        if (alreadySaved) {

            return res.json({

                message:
                    "Answer already saved"

            });

        }


        const savedAnswer =
            new Saved({

                question: question,

                answer: answer,

                source: source,

                userId: userId

            });


        await savedAnswer.save();


        res.json({

            message:
                "Answer saved successfully"

        });

    } catch (error) {

        console.log(
            "SAVE ERROR:",
            error.message
        );

        res.status(500).json({

            message:
                "Cannot save answer"

        });

    }

});


app.get("/saved", async (req, res) => {

    try {

        const userId = req.query.userId;

        if (!userId) {
            return res.status(401).json({
                requireLogin: true,
                message: "Please log in to view your saved answers."
            });
        }

        const savedAnswers =
            await Saved.find({ userId }).sort({

                date: -1

            });

        res.json(savedAnswers);

    } catch (error) {

        res.status(500).json({

            message:
                "Cannot load saved answers"

        });

    }

});


app.delete("/saved/:id", async (req, res) => {

    try {

        const { userId } = req.query;
        const { id } = req.params;

        if (!userId) {
            return res.status(401).json({
                requireLogin: true,
                message: "Please log in to remove saved answers."
            });
        }

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid saved answer id" });
        }

        const deletedAnswer = await Saved.findOneAndDelete({ _id: id, userId });
        if (!deletedAnswer) {
            return res.status(404).json({ message: "Saved answer not found" });
        }

        return res.json({ message: "Saved answer removed" });

    } catch (error) {

        console.log("DELETE SAVED ANSWER ERROR:", error.message);
        return res.status(500).json({

            message:
                "Cannot remove saved answer"

        });

    }

});



app.post("/signup", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (
            !name?.trim() ||
            !email?.trim() ||
            !password
        ) {
            return res.status(400).json({
                message: "Please fill in all fields."
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                message: "Password must contain at least 8 characters."
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const oldUser = await User.findOne({
            email: normalizedEmail
        });

        if (oldUser) {
            return res.status(409).json({
                message: "An account with this email already exists."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            name: name.trim(),
            email: normalizedEmail,
            password: hashedPassword
        });

        await newUser.save();

        return res.status(201).json({
            message: "Signup successful. You can now log in."
        });

    } catch (error) {
        console.log("SIGNUP ERROR:", error.message);

        if (error.code === 11000) {
            return res.status(409).json({
                message: "An account with this email already exists."
            });
        }

        return res.status(500).json({
            message: "Signup failed. Please try again.",
            error: error.message
        });
    }
});


app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email?.trim() || !password) {
            return res.status(400).json({
                message: "Please enter your email and password."
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const user = await User.findOne({
            email: normalizedEmail
        });

        if (!user) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        const correctPassword = await bcrypt.compare(
            password,
            user.password
        );

        if (!correctPassword) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        return res.status(200).json({
            message: "Login successful",
            userId: user._id,
            name: user.name,
            email: user.email
        });

    } catch (error) {
        console.log("LOGIN ERROR:", error.message);

        return res.status(500).json({
            message: "Login failed. Please try again.",
            error: error.message
        });
    }
});

// ================================
// GET USER STATUS (rolling 4-hour free-plan window state)
// ================================
app.get("/user-status", async (req, res) => {
    try {
        const userId = req.query.userId;
        if (!userId) return res.status(400).json({ message: "userId required" });

        const dbUser = await User.findById(userId).select("windowQuestionsUsed windowStart isPremium premiumExpiresAt");
        if (!dbUser) return res.status(404).json({ message: "User not found" });

        const premiumActive = dbUser.isPremium && dbUser.premiumExpiresAt && new Date() < new Date(dbUser.premiumExpiresAt);

        const now         = Date.now();
        const windowStart = dbUser.windowStart ? new Date(dbUser.windowStart).getTime() : now;
        const windowAge   = now - windowStart;
        const windowExpired = windowAge >= USER_WINDOW_MS;

        // If window expired, effective count is 0
        const effectiveUsed = windowExpired ? 0 : (dbUser.windowQuestionsUsed || 0);
        const resetAt        = !windowExpired && effectiveUsed >= USER_WINDOW_LIMIT
            ? windowStart + USER_WINDOW_MS
            : null;
        const waitSecs       = resetAt ? Math.max(0, Math.ceil((resetAt - now) / 1000)) : 0;

        res.json({
            windowQuestionsUsed: effectiveUsed,
            windowLimit: USER_WINDOW_LIMIT,
            remaining: Math.max(0, USER_WINDOW_LIMIT - effectiveUsed),
            windowResetTime: resetAt,
            waitSeconds: waitSecs,
            isPremium: premiumActive,
            premiumExpiresAt: dbUser.premiumExpiresAt || null,
            maxPromptChars: MAX_PROMPT_CHARS
        });
    } catch (error) {
        console.log("USER STATUS ERROR:", error.message);
        res.status(500).json({ message: "Cannot fetch user status" });
    }
});

// ================================
// MOCK PURCHASE PREMIUM (no real payment)
// ================================
app.post("/purchase-premium", async (req, res) => {
    try {
        const { userId, plan } = req.body;
        if (!userId) return res.status(400).json({ message: "userId required" });

        const dbUser = await User.findById(userId);
        if (!dbUser) return res.status(404).json({ message: "User not found" });

        // Mock: grant 30-day premium subscription
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        await User.findByIdAndUpdate(userId, {
            isPremium: true,
            premiumExpiresAt: expiresAt
        });

        console.log(`[PREMIUM] User ${userId} upgraded to premium. Expires: ${expiresAt.toISOString()}`);

        res.json({
            success: true,
            message: "Premium activated successfully!",
            premiumExpiresAt: expiresAt,
            plan: plan || "monthly"
        });
    } catch (error) {
        console.log("PURCHASE ERROR:", error.message);
        res.status(500).json({ message: "Cannot process purchase" });
    }
});

app.put("/feedback/:id", async (req, res) => {

    try {

        const feedback = req.body.feedback;

        const updatedChat = await Chat.findByIdAndUpdate(
            req.params.id,
            {
                feedback: feedback
            },
            {
                new: true
            }
        );

        if (!updatedChat) {

            return res.status(404).json({
                message: "Chat not found"
            });
        }

        res.json({
            message: "Feedback saved",
            feedback: updatedChat.feedback
        });

    } catch (error) {

        console.log(
            "FEEDBACK ERROR:",
            error.message
        );

        res.status(500).json({
            message: "Cannot save feedback"
        });

    }

});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});