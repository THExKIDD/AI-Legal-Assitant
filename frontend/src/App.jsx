import { useState, useEffect } from "react";
import "./App.css";

import legalLogo from "./assets/legal-logo.png";
import legalHero from "./assets/legal-hero.png";
import LegalMessageContent from "./LegalMessageContent";

const API_URL = "http://localhost:5000";

const GUEST_FREE_LIMIT = 3;
const GUEST_COOLDOWN_SECONDS = 4 * 60 * 60; // 4 hours
const USER_WINDOW_LIMIT  = 10;                  // 10 free questions per 4-hour window
const MAX_PROMPT_CHARS   = 1500;                // max chars per prompt

function App() {
  const [showIntro, setShowIntro] = useState(true);
  const [introLeaving, setIntroLeaving] = useState(false);

  useEffect(() => {
    const leaveTimer = window.setTimeout(() => setIntroLeaving(true), 4200);
    const finishTimer = window.setTimeout(() => setShowIntro(false), 4700);

    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(finishTimer);
    };
  }, []);

  // =========================
  // LOGIN AND SIGNUP STATES
  // =========================

  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem("legalAssistantUser");
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authPromptNotice, setAuthPromptNotice] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authSuccess, setAuthSuccess] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  // =========================
  // PREMIUM / PAYWALL STATES
  // =========================

  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  // User rolling-window status fetched from server
  const [userStatus, setUserStatus] = useState({
    windowQuestionsUsed: 0,
    windowLimit: USER_WINDOW_LIMIT,
    remaining: USER_WINDOW_LIMIT,
    windowResetTime: null,
    waitSeconds: 0,
    isPremium: false,
    premiumExpiresAt: null,
    maxPromptChars: MAX_PROMPT_CHARS
  });
  // Live countdown for user window cooldown
  const [userWindowCooldown, setUserWindowCooldown] = useState(0);

  // =========================
  // FREE GUEST LIMIT & TIMER STATES
  // =========================

  const [guestCount, setGuestCount] = useState(() => {
    try {
      const saved = localStorage.getItem("legal_guest_count");
      return saved ? parseInt(saved, 10) : 0;
    } catch {
      return 0;
    }
  });

  const [guestResetTime, setGuestResetTime] = useState(() => {
    try {
      const saved = localStorage.getItem("legal_guest_reset");
      return saved ? parseInt(saved, 10) : null;
    } catch {
      return null;
    }
  });

  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  // Countdown timer ticker for free guest limit
  useEffect(() => {
    if (user?.userId) {
      setCooldownRemaining(0);
      return;
    }

    function checkTimer() {
      if (!guestResetTime) {
        setCooldownRemaining(0);
        return;
      }

      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((guestResetTime - now) / 1000));

      if (remaining > 0 && guestCount >= GUEST_FREE_LIMIT) {
        setCooldownRemaining(remaining);
      } else if (remaining === 0) {
        setCooldownRemaining(0);
        setGuestCount(0);
        setGuestResetTime(null);
        localStorage.removeItem("legal_guest_count");
        localStorage.removeItem("legal_guest_reset");
      } else {
        setCooldownRemaining(0);
      }
    }

    checkTimer();
    const interval = setInterval(checkTimer, 1000);
    return () => clearInterval(interval);
  }, [guestResetTime, guestCount, user?.userId]);

  // Countdown timer for logged-in user's 4-hour free-plan window
  useEffect(() => {
    if (!userStatus.windowResetTime || userStatus.isPremium) {
      setUserWindowCooldown(0);
      return;
    }

    function checkWindowTimer() {
      const now = Date.now();
      const secs = Math.max(0, Math.ceil((userStatus.windowResetTime - now) / 1000));
      if (secs <= 0) {
        setUserWindowCooldown(0);
        // Window has expired — refresh status from server
        if (user?.userId) fetchUserStatus(user.userId);
      } else {
        setUserWindowCooldown(secs);
      }
    }

    checkWindowTimer();
    const interval = setInterval(checkWindowTimer, 1000);
    return () => clearInterval(interval);
  }, [userStatus.windowResetTime, userStatus.isPremium, user?.userId]);

  function formatWaitTime(seconds) {
    if (seconds <= 0) return "00:00";
    const totalMins = Math.floor(seconds / 60);
    const hrs  = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}h ${mins.toString().padStart(2, "0")}m ${secs.toString().padStart(2, "0")}s`;
    }
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  // Load chat history for logged-in user on mount or user change
  useEffect(() => {
    if (user?.userId) {
      showHistoryForUser(user.userId);
      fetchUserStatus(user.userId);
    } else {
      setHistory([]);
      setUserStatus({ windowQuestionsUsed: 0, windowLimit: USER_WINDOW_LIMIT, remaining: USER_WINDOW_LIMIT, windowResetTime: null, waitSeconds: 0, isPremium: false, premiumExpiresAt: null, maxPromptChars: MAX_PROMPT_CHARS });
    }
  }, [user?.userId]);

  async function showHistoryForUser(activeUserId) {
    if (!activeUserId) return;
    try {
      const response = await fetch(`${API_URL}/history?userId=${activeUserId}`);
      if (response.ok) {
        const data = await response.json();
        setHistory(Array.isArray(data) ? data : []);
      }
    } catch {
      // silently ignore initial history load error
    }
  }

  async function fetchUserStatus(activeUserId) {
    if (!activeUserId) return;
    try {
      const res = await fetch(`${API_URL}/user-status?userId=${activeUserId}`);
      if (res.ok) {
        const data = await res.json();
        setUserStatus({
          windowQuestionsUsed: data.windowQuestionsUsed || 0,
          windowLimit: data.windowLimit || USER_WINDOW_LIMIT,
          remaining: data.remaining ?? USER_WINDOW_LIMIT,
          windowResetTime: data.windowResetTime || null,
          waitSeconds: data.waitSeconds || 0,
          isPremium: Boolean(data.isPremium),
          premiumExpiresAt: data.premiumExpiresAt || null,
          maxPromptChars: data.maxPromptChars || MAX_PROMPT_CHARS
        });
        if (data.waitSeconds > 0) setUserWindowCooldown(data.waitSeconds);
      }
    } catch {
      // silently ignore
    }
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();

    setAuthMessage("");
    setAuthSuccess(false);

    const name = authName.trim();
    const email = authEmail.trim().toLowerCase();

    if (!email || !authPassword) {
      setAuthMessage("Please fill in all required fields.");
      return;
    }

    if (authMode === "signup") {
      if (!name) {
        setAuthMessage("Please enter your full name.");
        return;
      }

      if (authPassword.length < 8) {
        setAuthMessage("Password must contain at least 8 characters.");
        return;
      }

      if (authPassword !== confirmPassword) {
        setAuthMessage("Passwords do not match. Please ensure both passwords are identical.");
        return;
      }
    }

    setAuthLoading(true);

    try {
      const endpoint =
        authMode === "signup" ? "/signup" : "/login";

      const body =
        authMode === "signup"
          ? { name, email, password: authPassword, role: "Normal User" }
          : { email, password: authPassword };

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Request failed. Please try again.");
      }

      if (authMode === "signup") {
        if (data.message?.toLowerCase().includes("already exists")) {
          setAuthMessage("An account with this email already exists.");
          return;
        }

        // Auto login right after successful signup
        try {
          const autoRes = await fetch(`${API_URL}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password: authPassword })
          });
          const autoData = await autoRes.json();
          if (autoRes.ok && autoData.userId) {
            const loggedInUser = {
              userId: autoData.userId,
              name: autoData.name || name || "Normal User",
              email,
            };
            localStorage.setItem("legalAssistantUser", JSON.stringify(loggedInUser));
            setUser(loggedInUser);
            setShowAuthModal(false);
            setAuthPromptNotice("");
            setAuthName("");
            setAuthEmail("");
            setAuthPassword("");
            setConfirmPassword("");
            setAuthMessage("");
            // Clear guest limits on login
            setGuestCount(0);
            setCooldownRemaining(0);
            setGuestResetTime(null);
            localStorage.removeItem("legal_guest_count");
            localStorage.removeItem("legal_guest_reset");
            showHistoryForUser(loggedInUser.userId);
            fetchUserStatus(loggedInUser.userId);
            return;
          }
        } catch {
          // fallback to manual login prompt
        }

        setAuthMode("login");
        setAuthPassword("");
        setConfirmPassword("");
        setAuthMessage("Account created successfully. Please log in.");
        setAuthSuccess(true);
        return;
      }

      if (
        (data.message !== "Login successful" && !data.success) ||
        !data.userId
      ) {
        setAuthMessage(data.message || "Invalid email or password.");
        return;
      }

      const loggedInUser = {
        userId: data.userId,
        name: data.name || "Normal User",
        email,
      };

      localStorage.setItem(
        "legalAssistantUser",
        JSON.stringify(loggedInUser)
      );

      setUser(loggedInUser);
      setShowAuthModal(false);
      setAuthPromptNotice("");
      setAuthName("");
      setAuthEmail("");
      setAuthPassword("");
      setConfirmPassword("");
      setAuthMessage("");
      // Clear guest limits on login
      setGuestCount(0);
      setCooldownRemaining(0);
      setGuestResetTime(null);
      localStorage.removeItem("legal_guest_count");
      localStorage.removeItem("legal_guest_reset");
      showHistoryForUser(loggedInUser.userId);
      fetchUserStatus(loggedInUser.userId);
    } catch (error) {
      setAuthMessage(
        error.message ||
        "Cannot connect to the server. Please check your backend."
      );
    } finally {
      setAuthLoading(false);
    }
  }

  function switchAuthMode(mode) {
    setAuthMode(mode);
    setAuthMessage("");
    setAuthSuccess(false);
    setAuthPassword("");
    setConfirmPassword("");
  }

  function handleLogout() {
    localStorage.removeItem("legalAssistantUser");
    setUser(null);
    setHistorySearch("");

    setQuestion("");
    setMessages([]);
    setHistory([]);
    setSavedAnswers([]);
    setShowSaved(false);
    setShowAbout(false);
    setExpandedMap({});
    setUserStatus({ windowQuestionsUsed: 0, windowLimit: USER_WINDOW_LIMIT, remaining: USER_WINDOW_LIMIT, windowResetTime: null, waitSeconds: 0, isPremium: false, premiumExpiresAt: null, maxPromptChars: MAX_PROMPT_CHARS });
    setUserWindowCooldown(0);
    setShowPaywallModal(false);
    setPurchaseSuccess(false);
  }

  // =========================
  // CHAT STATES
  // =========================

  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [history, setHistory] = useState([]);
  const [historySearch, setHistorySearch] = useState("");
  const [savedAnswers, setSavedAnswers] = useState([]);
  const [showSaved, setShowSaved] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expandedMap, setExpandedMap] = useState({});

  function toggleExpand(msgId) {
    setExpandedMap((prev) => ({
      ...prev,
      [msgId]: !prev[msgId],
    }));
  }

  function handleAskDetail(promptText) {
    if (!promptText) return;

    const finalDetailPrompt = promptText.toLowerCase().includes("detail")
      ? promptText
      : `Please explain in detail: ${promptText}`;

    askQuestion(finalDetailPrompt, true);
  }

  function openPricing() {
    setShowPricing(true);
    setShowAbout(false);
    setShowSaved(false);
    setMessages([]);
    setQuestion("");
    setPurchaseSuccess(false);
  }

  function startPremiumPurchase() {
    if (!user?.userId) {
      setAuthMode("signup");
      setAuthPromptNotice("Create a free account to continue to Premium checkout.");
      setShowAuthModal(true);
      return;
    }

    setShowPaywallModal(true);
    setPurchaseSuccess(false);
  }

  // =========================
  // ASK LEGAL QUESTION
  // Condition 1: Free/guest users get normal standard answers (not detailed)
  // Condition 2: Free users have a question limit, then a 4-hour countdown
  // =========================

  async function askQuestion(customQuestion = "", isDetailed = false) {
    const isUserLoggedIn = Boolean(user?.userId);

    // Free guest rate limit check before sending request
    if (!isUserLoggedIn) {
      if (cooldownRemaining > 0 || guestCount >= GUEST_FREE_LIMIT) {
        setAuthPromptNotice(
          `Free guest limit reached (${GUEST_FREE_LIMIT} questions). Please wait ${formatWaitTime(cooldownRemaining || GUEST_COOLDOWN_SECONDS)} or create an account for 10 questions every 4 hours.`
        );
        setShowAuthModal(true);
        return;
      }
    }

    // Logged-in user: check window cooldown before sending
    if (isUserLoggedIn && !userStatus.isPremium && userWindowCooldown > 0) {
      setShowPaywallModal(true);
      setPurchaseSuccess(false);
      return;
    }

    const finalQuestion =
      typeof customQuestion === "string" &&
        customQuestion.trim() !== ""
        ? customQuestion
        : question;

    if (finalQuestion.trim() === "") return;

    // Client-side prompt length check (mirrors backend 413)
    const maxChars = userStatus.maxPromptChars || MAX_PROMPT_CHARS;
    if (finalQuestion.length > maxChars) {
      setMessages((prev) => [
        ...prev,
        {
          question: finalQuestion.slice(0, 80) + "...",
          answer: `⚠️ **Prompt Too Long**\n\nYour message is **${finalQuestion.length} characters** — the limit is **${maxChars} characters** (~230 words).\n\nPlease shorten your question and try again. This limit applies to all users (like Claude\'s context window).`,
          source: "",
          feedback: "",
          isDetailed: false,
        }
      ]);
      return;
    }

    setQuestion("");
    setLoading(true);
    setShowAbout(false);
    setShowSaved(false);

    try {
      // Condition: Non-logged-in users get normal answer (detailed is disabled for guests)
      const effectiveDetailed = isUserLoggedIn ? isDetailed : false;

      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: finalQuestion,
          is_detailed: effectiveDetailed,
          save_chat: isUserLoggedIn,
          userId: isUserLoggedIn ? user.userId : null,
        }),
      });

      const data = await response.json();

      // 413 — prompt too long (backup server-side check)
      if (response.status === 413 || data.prompt_too_long) {
        setMessages((oldMessages) => [
          ...oldMessages,
          {
            question: finalQuestion.slice(0, 80) + "...",
            answer: `⚠️ **Prompt Too Long**\n\nYour message is **${data.prompt_length || finalQuestion.length} characters** — the limit is **${data.max_length || MAX_PROMPT_CHARS} characters** (~230 words).\n\nPlease shorten your question and try again.`,
            source: "",
            feedback: "",
            isDetailed: false,
          }
        ]);
        return;
      }

      // 429 — guest limit exceeded
      if (response.status === 429 && data.limit_exceeded) {
        const waitSec = data.wait_seconds || GUEST_COOLDOWN_SECONDS;
        const resetAt = data.reset_time || Date.now() + waitSec * 1000;
        setGuestCount(GUEST_FREE_LIMIT);
        setGuestResetTime(resetAt);
        setCooldownRemaining(waitSec);
        localStorage.setItem("legal_guest_count", String(GUEST_FREE_LIMIT));
        localStorage.setItem("legal_guest_reset", String(resetAt));

        setMessages((oldMessages) => [
          ...oldMessages,
          {
            question: finalQuestion,
            answer: `⏳ **Free AI Query Limit Exceeded**\n\nYou have used your ${GUEST_FREE_LIMIT} free guest questions. Please wait **${formatWaitTime(waitSec)}** before asking another question, or **Log In / Sign Up** for 10 free questions every 4 hours.`,
            source: "",
            feedback: "",
            isDetailed: false,
          },
        ]);

        setAuthPromptNotice(`Free guest limit (${GUEST_FREE_LIMIT} questions) reached. Create an account for 10 questions every 4 hours.`);
        setShowAuthModal(true);
        return;
      }

      // 429 — logged-in user window exceeded
      if (response.status === 429 && data.user_limit_exceeded) {
        const waitSec = data.wait_seconds || 0;
        const resetAt = data.reset_time || Date.now() + waitSec * 1000;
        setUserWindowCooldown(waitSec);
        setUserStatus((prev) => ({
          ...prev,
          windowQuestionsUsed: data.window_questions_used || USER_WINDOW_LIMIT,
          remaining: 0,
          windowResetTime: resetAt,
          waitSeconds: waitSec
        }));
        setShowPaywallModal(true);
        setPurchaseSuccess(false);
        return;
      }

      // Legacy 402 check (kept for safety)
      if (response.status === 402 || data.user_limit_exceeded) {
        setShowPaywallModal(true);
        setPurchaseSuccess(false);
        return;
      }

      if (!response.ok) {
        throw new Error(data.answer || "Unable to get an answer.");
      }

      // Track guest usage count
      if (!isUserLoggedIn) {
        const newUsed = data.guest_usage?.used ?? (guestCount + 1);
        setGuestCount(newUsed);
        localStorage.setItem("legal_guest_count", String(newUsed));

        if (newUsed >= GUEST_FREE_LIMIT) {
          const resetAt = data.guest_usage?.reset_time || Date.now() + GUEST_COOLDOWN_SECONDS * 1000;
          setGuestResetTime(resetAt);
          localStorage.setItem("legal_guest_reset", String(resetAt));
          setCooldownRemaining(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)));
        }
      } else {
        const usage = data.user_usage;
        const resetAt = usage?.reset_time || null;
        setUserStatus((prev) => ({
          ...prev,
          windowQuestionsUsed: usage?.used ?? prev.windowQuestionsUsed + 1,
          remaining: usage?.remaining ?? Math.max(0, prev.remaining - 1),
          windowResetTime: resetAt
        }));
        if (resetAt) {
          setUserWindowCooldown(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)));
        }
      }

      const newMessage = {
        _id: data._id || `guest-${Date.now()}`,
        question: finalQuestion,
        answer: data.answer,
        source: data.source || "",
        feedback: "",
        isDetailed: effectiveDetailed,
      };

      setMessages((oldMessages) => [...oldMessages, newMessage]);

      // Like ChatGPT: Only save and load history from MongoDB if the user is logged in
      if (isUserLoggedIn) {
        await showHistoryForUser(user.userId);
      }
    } catch (error) {
      setMessages((oldMessages) => [
        ...oldMessages,
        {
          question: finalQuestion,
          answer:
            "Something went wrong. Please check that the backend and AI service are running, then try again.",
          source: "",
          feedback: "",
          isDetailed: false,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // CHAT HISTORY
  // =========================

  async function showHistory() {
    if (!user?.userId) {
      setAuthPromptNotice("Please log in to view and save your conversation history.");
      setShowAuthModal(true);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/history?userId=${user.userId}`);

      if (!response.ok) {
        throw new Error("Cannot load chat history.");
      }

      const data = await response.json();

      setHistory(Array.isArray(data) ? data : []);
      setShowSaved(false);
      setShowAbout(false);
      setShowPricing(false);
    } catch (error) {
      alert("Cannot load chat history.");
    }
  }

  function openHistory(chat) {
    const oldMessage = {
      _id: chat._id,
      question: chat.question,
      answer: chat.answer,
      source: chat.source || "",
      feedback: chat.feedback || "",
      isDetailed: Boolean(
        chat.isDetailed ||
        chat.question?.toLowerCase().includes("detail")
      ),
    };

    setMessages([oldMessage]);
    setQuestion("");
    setShowSaved(false);
    setShowAbout(false);
    setShowPricing(false);
  }

  async function deleteHistoryChat(chatId) {
    if (!user?.userId || !window.confirm("Delete this chat from your history?")) return;

    try {
      const response = await fetch(
        `${API_URL}/history/${encodeURIComponent(chatId)}?userId=${encodeURIComponent(user.userId)}`,
        { method: "DELETE" }
      );
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        if (response.status === 404) {
          throw new Error("The chat-delete API route is unavailable. Restart the backend server and try again.");
        }
        throw new Error(`Unexpected response from the server (HTTP ${response.status}).`);
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Cannot delete chat history.");
      }

      setHistory((previousHistory) =>
        previousHistory.filter((chat) => chat._id !== chatId)
      );
      setMessages((previousMessages) =>
        previousMessages.filter((message) => message._id !== chatId)
      );
    } catch (error) {
      alert(error.message || "Cannot delete chat history.");
    }
  }

  // =========================
  // SAVED ANSWERS
  // =========================

  async function saveAnswer(message) {
    if (!user?.userId) {
      setAuthPromptNotice("Please log in or create an account to save answers to your MongoDB account.");
      setShowAuthModal(true);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/saved`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: message.question,
          answer: message.answer,
          source: message.source,
          userId: user.userId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Cannot save answer.");
      }

      alert(data.message || "Answer saved successfully.");
    } catch (error) {
      alert(error.message || "Cannot save answer.");
    }
  }

  async function showSavedAnswers() {
    if (!user?.userId) {
      setAuthPromptNotice("Please log in or create an account to view your saved answers.");
      setShowAuthModal(true);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/saved?userId=${user.userId}`);

      if (!response.ok) {
        throw new Error("Cannot load saved answers.");
      }

      const data = await response.json();

      setSavedAnswers(Array.isArray(data) ? data : []);
      setShowSaved(true);
      setShowAbout(false);
      setShowPricing(false);
    } catch (error) {
      alert("Cannot load saved answers.");
    }
  }

  function openSavedAnswer(item) {
    setMessages([
      {
        question: item.question,
        answer: item.answer,
        source: item.source || "",
        feedback: "",
      },
    ]);

    setQuestion("");
    setShowSaved(false);
    setShowAbout(false);
  }

  async function deleteSavedAnswer(id) {
    if (!user?.userId) {
      setAuthPromptNotice("Please log in to manage your saved answers.");
      setShowAuthModal(true);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/saved/${id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Cannot remove saved answer.");
      }

      alert(data.message || "Saved answer removed.");
      await showSavedAnswers();
    } catch (error) {
      alert(error.message || "Cannot remove saved answer.");
    }
  }

  // =========================
  // PREMIUM PURCHASE (mock)
  // =========================

  async function handlePurchasePremium() {
    if (!user?.userId) return;
    setPurchaseLoading(true);
    try {
      const res = await fetch(`${API_URL}/purchase-premium`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.userId, plan: "monthly" })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPurchaseSuccess(true);
        setUserStatus((prev) => ({
          ...prev,
          isPremium: true,
          premiumExpiresAt: data.premiumExpiresAt
        }));
        // Refresh status from server
        await fetchUserStatus(user.userId);
      } else {
        alert(data.message || "Purchase failed. Please try again.");
      }
    } catch {
      alert("Cannot connect to server. Please try again.");
    } finally {
      setPurchaseLoading(false);
    }
  }

  // =========================
  // FEEDBACK
  // =========================

  async function sendFeedback(messageId, feedbackType) {
    if (!messageId || messageId.startsWith("msg-") || messageId.startsWith("guest-")) {
      alert("Feedback is saved for logged-in accounts.");
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/feedback/${messageId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            feedback: feedbackType,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        alert(data.message || "Cannot save feedback.");
        return;
      }

      setMessages((oldMessages) =>
        oldMessages.map((message) =>
          message._id === messageId
            ? { ...message, feedback: feedbackType }
            : message
        )
      );
    } catch (error) {
      alert("Cannot save feedback.");
    }
  }

  // =========================
  // GENERAL FUNCTIONS
  // =========================

  function openAbout() {
    setShowAbout(true);
    setShowSaved(false);
    setShowPricing(false);
    setMessages([]);
    setQuestion("");
  }

  function newChat() {
    setMessages([]);
    setQuestion("");
    setShowSaved(false);
    setShowAbout(false);
    setShowPricing(false);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      askQuestion();
    }
  }

  async function copyAnswer(text) {
    try {
      await navigator.clipboard.writeText(text);
      alert("Answer copied.");
    } catch {
      alert("Unable to copy the answer.");
    }
  }

  async function copyQuestion(text) {
    try {
      await navigator.clipboard.writeText(text);
      alert("Question copied.");
    } catch {
      alert("Unable to copy the question.");
    }
  }

  // =========================
  // MAIN APPLICATION (Always opens first)
  // =========================

  const filteredHistory = history.filter((chat) =>
    chat.question?.toLowerCase().includes(historySearch.trim().toLowerCase())
  );

  return (
    <div className="legal-app">
      {showIntro && (
        <div
          className={`intro-screen${introLeaving ? " intro-screen--leaving" : ""}`}
          role="status"
          aria-live="polite"
          aria-label="Loading AI Legal Assistant"
        >
          <div className="intro-ambient intro-ambient--one" aria-hidden="true" />
          <div className="intro-ambient intro-ambient--two" aria-hidden="true" />

          <div className="intro-content">
            <div className="intro-book-scene" aria-hidden="true">
              <div className="intro-book">
                <div className="intro-book-pages">
                  <div className="intro-page-lines intro-page-lines--left" />
                  <div className="intro-page-lines intro-page-lines--right" />
                </div>
                <div className="intro-book-cover">
                  <div className="intro-book-cover-front">
                    <div className="intro-book-emblem">
                      <img src={legalLogo} alt="" />
                    </div>
                    <span className="intro-book-title">LEGAL<br />GUIDANCE</span>
                    <span className="intro-book-rule" />
                  </div>
                  <div className="intro-book-cover-inside">
                    <span>KNOWLEDGE</span>
                    <span className="intro-book-inside-rule" />
                    <span>RIGHTS · JUSTICE</span>
                  </div>
                </div>
              </div>
              <div className="intro-book-shadow" />
            </div>

            <p className="intro-eyebrow">YOUR RIGHTS. OUR SUPPORT.</p>
            <h1 className="intro-title">AI Legal Assistant</h1>
            <p className="intro-subtitle">Preparing your legal workspace</p>
            <div className="intro-progress" aria-hidden="true">
              <span />
            </div>
          </div>
        </div>
      )}

      {/* LEFT SIDEBAR */}
      <aside className="sidebar">
        <div className="logo-area">
          <div className="logo-icon">
            <img src={legalLogo} alt="AI Legal Assistant" />
          </div>

          <div className="logo-text">
            <h2>AI LEGAL</h2>
            <h2>ASSISTANT</h2>
            <span>Your Rights. Our Support.</span>
          </div>
        </div>

        <button className="new-chat" onClick={newChat}>
          <span>＋</span>
          New Chat
        </button>

        <div className="menu">
          <button
            className={
              !showSaved && !showAbout && !showPricing
                ? "menu-item active"
                : "menu-item"
            }
            onClick={showHistory}
          >
            <span>◉</span>
            Chat History
          </button>

          <button
            className={showSaved ? "menu-item active" : "menu-item"}
            onClick={showSavedAnswers}
          >
            <span>♡</span>
            Saved Answers
          </button>

          <button
            className={showAbout ? "menu-item active" : "menu-item"}
            onClick={openAbout}
          >
            <span>ⓘ</span>
            About Assistant
          </button>

          <button
            className={showPricing ? "menu-item active" : "menu-item"}
            onClick={openPricing}
          >
            <span>₹</span>
            Plans &amp; Pricing
          </button>
        </div>

        <div className="line"></div>

        {!showSaved && !showAbout && !showPricing && (
          <>
            <p className="recent-title">RECENT CHATS</p>

            {user ? (
              <>
                <input
                  className="history-search"
                  type="search"
                  placeholder="Search chat history..."
                  aria-label="Search chat history"
                  value={historySearch}
                  onChange={(event) => setHistorySearch(event.target.value)}
                />
                <div className="recent-chats">
                  {filteredHistory.length === 0 ? (
                    <p className="empty-history">
                      {history.length === 0
                        ? "No chat history yet."
                        : "No chats match your search."}
                    </p>
                  ) : (
                    filteredHistory.map((chat) => (
                      <div className="recent-chat" key={chat._id}>
                        <span>▤</span>
                        <button
                          type="button"
                          className="recent-chat-open"
                          onClick={() => openHistory(chat)}
                          title={chat.question}
                        >
                          {chat.question}
                        </button>
                        <button
                          type="button"
                          className="delete-chat"
                          onClick={() => deleteHistoryChat(chat._id)}
                          aria-label={`Delete chat: ${chat.question}`}
                          title="Delete chat"
                        >
                          ×
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <div className="guest-sidebar-notice">
                <p>🔒 Chats are not saved</p>
                <span>
                  Guest mode is active like ChatGPT. Your chats will not be saved unless you log in.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAuthPromptNotice("Log in to save questions to your MongoDB account.");
                    setShowAuthModal(true);
                  }}
                >
                  Log In to Save History
                </button>
              </div>
            )}
          </>
        )}

        {showSaved && (
          <div className="saved-section">
            <p className="recent-title">SAVED ANSWERS</p>

            {savedAnswers.length === 0 ? (
              <p className="empty-history">No saved answers yet.</p>
            ) : (
              savedAnswers.map((item) => (
                <div className="saved-item" key={item._id}>
                  <div
                    className="saved-open"
                    onClick={() => openSavedAnswer(item)}
                  >
                    <span>♡</span>
                    <p>{item.question}</p>
                  </div>

                  <button
                    className="delete-saved"
                    onClick={() => deleteSavedAnswer(item._id)}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        <div className="privacy-card">
          <div className="privacy-title">
            ⚖ Knowledge Empowers Justice
          </div>
          <p>Accessible legal information for a fairer society.</p>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="welcome">
              {user
                ? `Welcome back, ${user.name}`
                : "Welcome to AI Legal Assistant (Guest Mode)"}
            </p>

            <h1>How can I help you today?</h1>
          </div>

          <div className="top-actions">
            <div className="powered">
              AI Powered by <span> ✦ Ollama</span>
            </div>

            <button className="theme-button" type="button">
              ◐
            </button>

            {user ? (
              <div className="user-box-wrapper">
                <div className="user-box">
                  <div className="avatar">{userStatus.isPremium ? "⭐" : "●"}</div>
                  <div className="user-box-info">
                    <span>{user.name}</span>
                    {userStatus.isPremium ? (
                      <span className="premium-badge-small">✦ Premium</span>
                    ) : (
                      <span className="user-usage-badge">
                        {userStatus.remaining} / {userStatus.windowLimit} left
                      </span>
                    )}
                  </div>

                  {!userStatus.isPremium && (
                    <button
                      type="button"
                      className="upgrade-btn-small"
                      onClick={() => { setShowPaywallModal(true); setPurchaseSuccess(false); }}
                      title="Upgrade to Premium"
                    >
                      ⚡ Upgrade
                    </button>
                  )}

                  <button
                    type="button"
                    className="logout-button"
                    onClick={handleLogout}
                    title="Log out"
                  >
                    Log Out
                  </button>
                </div>
              </div>
            ) : (
              <div className="topbar-guest-actions">
                <button
                  type="button"
                  className="user-box clickable"
                  onClick={() => {
                    setAuthPromptNotice("Log in to save questions and access your chat history.");
                    setShowAuthModal(true);
                  }}
                  title="Click to Log In"
                >
                  <div className="avatar">👤</div>
                  <span>Normal User</span>
                  <span className="guest-tag">(Guest)</span>
                </button>

                <button
                  type="button"
                  className="login-nav-button"
                  onClick={() => {
                    setAuthMode("login");
                    setAuthPromptNotice("");
                    setShowAuthModal(true);
                  }}
                >
                  Log In
                </button>

                <button
                  type="button"
                  className="signup-nav-button"
                  onClick={() => {
                    setAuthMode("signup");
                    setAuthPromptNotice("");
                    setShowAuthModal(true);
                  }}
                >
                  Sign Up
                </button>
              </div>
            )}
          </div>
        </header>

        <section className="chat-container">
          {/* ABOUT */}
          {showPricing && (
            <div className="pricing-page">
              <div className="pricing-heading">
                <span className="pricing-eyebrow">SIMPLE, TRANSPARENT PLANS</span>
                <h2>Choose the support that fits you</h2>
                <p>Free access refreshes every 4 hours. Guests get 3 questions; free accounts get 10.</p>
              </div>

              <div className="pricing-grid">
                <article className="pricing-card">
                  <div className="pricing-card-heading">
                    <span className="pricing-plan-icon">⚖</span>
                    <h3>Free</h3>
                  </div>
                  <p className="pricing-description">A helpful start for everyday legal questions.</p>
                  <div className="pricing-amount">₹0 <span>/ always</span></div>
                  <ul className="pricing-features">
                    <li>10 questions every 4 hours with a free account</li>
                    <li>1,500 characters per prompt</li>
                    <li>Concise legal information</li>
                    <li>Chat history and saved answers</li>
                  </ul>
                  <button type="button" className="pricing-secondary-btn" onClick={() => {
                    if (!user?.userId) {
                      setAuthMode("signup");
                      setShowAuthModal(true);
                    } else {
                      newChat();
                    }
                  }}>
                    {user?.userId ? "Continue with Free" : "Create a free account"}
                  </button>
                </article>

                <article className="pricing-card pricing-card-featured">
                  <span className="pricing-featured-badge">✦ PREMIUM</span>
                  <div className="pricing-card-heading">
                    <span className="pricing-plan-icon">✦</span>
                    <h3>Premium</h3>
                  </div>
                  <p className="pricing-description">More room for in-depth legal guidance.</p>
                  <div className="pricing-amount">₹299 <span>/ month</span></div>
                  <ul className="pricing-features">
                    <li>Unlimited AI legal questions</li>
                    <li>Detailed explanations</li>
                    <li>Full chat history and saved answers</li>
                    <li>30-day access; renew when you choose</li>
                  </ul>
                  <button type="button" className="pricing-primary-btn" onClick={startPremiumPurchase}>
                    ⚡ Choose Premium
                  </button>
                  <p className="pricing-demo-note">Demo checkout only — no real payment is taken.</p>
                </article>
              </div>

              <p className="pricing-prompt-note">
                Prompt limit: 1,500 characters per question. Longer prompts are rejected and do not use a question from your free allowance.
              </p>
            </div>
          )}

          {showAbout && (
            <div className="about-page">
              <h2>AI Legal Assistant</h2>

              <p className="about-subtitle">
                Your Legal Information Companion
              </p>

              <div className="about-card">
                <h3>About the Project</h3>
                <p>
                  AI Legal Assistant is designed to provide simple and
                  easy-to-understand information about common laws, legal
                  rights and basic legal procedures.
                </p>
              </div>

              <div className="about-grid">
                <div className="about-small-card">
                  <span>✦</span>
                  <h3>AI Technology</h3>
                  <p>
                    Ollama AI is used to generate simple legal explanations.
                  </p>
                </div>

                <div className="about-small-card">
                  <span>▤</span>
                  <h3>Legal Knowledge Base</h3>
                  <p>
                    ChromaDB searches relevant information from legal
                    documents.
                  </p>
                </div>

                <div className="about-small-card">
                  <span>▣</span>
                  <h3>Data Storage</h3>
                  <p>
                    MongoDB stores chat history and saved answers.
                  </p>
                </div>

                <div className="about-small-card">
                  <span>⚙</span>
                  <h3>Technology Stack</h3>
                  <p>
                    React.js, Node.js, Python, FastAPI, MongoDB and ChromaDB.
                  </p>
                </div>
              </div>

              <div className="about-disclaimer">
                <span>⚖</span>
                <div>
                  <h3>Important Disclaimer</h3>
                  <p>
                    This AI Legal Assistant provides general legal
                    information for educational purposes. It is not a
                    replacement for professional legal advice from a
                    qualified lawyer.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* HERO SCREEN */}
          {messages.length === 0 && !loading && !showAbout && !showPricing && (
            <div
              className="start-screen hero-screen"
              style={{
                backgroundImage: `linear-gradient(
                  90deg,
                  rgba(13, 32, 46, 0.94),
                  rgba(13, 32, 46, 0.72),
                  rgba(13, 32, 46, 0.20)
                ),
                url(${legalHero})`,
              }}
            >
              <div className="hero-content">
                <p className="hero-label">YOUR AI LEGAL ASSISTANT</p>

                <h2>
                  Clear Answers.
                  <br />
                  Stronger Citizens.
                </h2>

                <div className="hero-line"></div>

                <p className="hero-description">
                  Get simple information about common laws, legal procedures
                  and your rights.
                </p>

                <div className="suggestions">
                  <button
                    onClick={() =>
                      askQuestion("What is a legal notice?")
                    }
                  >
                    ▤ What is a legal notice?
                  </button>

                  <button
                    onClick={() => askQuestion("What is RTI Act?")}
                  >
                    ⚖ What is RTI?
                  </button>

                  <button
                    onClick={() =>
                      askQuestion("What are consumer rights?")
                    }
                  >
                    ◉ Consumer Rights
                  </button>

                  <button
                    onClick={() =>
                      askQuestion(
                        "Cheque bounce procedure in detail",
                        true
                      )
                    }
                  >
                    ⚡ Cheque Bounce in Detail
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* CONVERSATIONS */}
          {messages.map((message, index) => {
            const isDetailedAnswer = Boolean(
              message.isDetailed ||
              message.question?.toLowerCase().includes("detail") ||
              message.answer?.includes("### 📖 Legal Overview") ||
              message.answer?.includes("### Meaning and Legal Overview")
            );

            return (
              <div
                className="conversation"
                key={message._id || index}
              >
                <div className="question-row">
                  <div className="question-bubble">
                    <span>{message.question}</span>
                    <button
                      type="button"
                      className="question-copy"
                      onClick={() => copyQuestion(message.question)}
                      title="Copy question"
                      aria-label="Copy question"
                    >
                      ▢
                    </button>
                  </div>

                  <div className="small-avatar">●</div>
                </div>

                <div className="answer-card">
                  <div className="answer-top">
                    <div className="ai-logo">
                      <img src={legalLogo} alt="AI Legal Assistant" />
                    </div>

                    <div className="ai-top-details">
                      <div className="ai-title-row">
                        <h3>AI Legal Assistant</h3>

                        <span
                          className={`ai-mode-pill ${
                            isDetailedAnswer
                              ? "pill-detailed"
                              : "pill-concise"
                          }`}
                        >
                          {isDetailedAnswer
                            ? "📖 Detailed Explanation"
                            : "⚡ Concise Summary"}
                        </span>
                      </div>

                      <span className="ai-label">
                        Legal Information Assistant
                      </span>
                    </div>
                  </div>

                  <div className="answer-text">
                    <LegalMessageContent
                      answer={message.answer}
                      messageId={message._id || `msg-${index}`}
                      isExpanded={Boolean(
                        expandedMap[message._id || `msg-${index}`]
                      )}
                      onToggleExpand={toggleExpand}
                    />
                  </div>

                  <div className="answer-bottom">
                    <div className="feedback">
                      <button
                        title="Copy Answer"
                        onClick={() => copyAnswer(message.answer)}
                      >
                        ▢
                      </button>

                      <button
                        title="Save Answer"
                        onClick={() => saveAnswer(message)}
                      >
                        ♡
                      </button>

                      <button
                        className={
                          message.feedback === "helpful"
                            ? "feedback-active"
                            : ""
                        }
                        title="Helpful"
                        onClick={() =>
                          sendFeedback(message._id, "helpful")
                        }
                      >
                        👍
                      </button>

                      <button
                        className={
                          message.feedback === "not-helpful"
                            ? "feedback-active"
                            : ""
                        }
                        title="Not Helpful"
                        onClick={() =>
                          sendFeedback(message._id, "not-helpful")
                        }
                      >
                        👎
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* LOADING */}
          {loading && (
            <div className="conversation">
              <div className="answer-card">
                <div className="answer-top">
                  <div className="ai-logo">
                    <img src={legalLogo} alt="AI Legal Assistant" />
                  </div>

                  <div>
                    <h3>AI Legal Assistant</h3>
                    <span className="ai-label">
                      Searching legal information...
                    </span>
                  </div>
                </div>

                <div className="thinking">
                  <span></span>
                  <span></span>
                  <span></span>

                  <p>Reviewing legal information...</p>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* INPUT */}
        {!showAbout && !showPricing && (
          <div className="input-section">
            {/* Free guest status or wait timer */}
            {!user && (
              <>
                {cooldownRemaining > 0 ? (
                  <div className="limit-exceeded-card">
                    <div className="limit-exceeded-left">
                      <div className="limit-exceeded-icon">⏳</div>
                      <div className="limit-exceeded-info">
                        <h4>Free AI Query Limit Exceeded</h4>
                        <p>
                          You have used your {GUEST_FREE_LIMIT} free questions. Please wait{" "}
                          <span className="countdown-timer">{formatWaitTime(cooldownRemaining)}</span>{" "}
                          before asking another question.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="bypass-login-btn"
                      onClick={() => {
                        setAuthPromptNotice("Create a free account for 10 questions every 4 hours.");
                        setShowAuthModal(true);
                      }}
                    >
                      ⚡ Log In to Bypass Wait Time
                    </button>
                  </div>
                ) : (
                  <div className="guest-query-status">
                    <span>
                      🆓 Free Guest Questions:{" "}
                      <span className="query-counter-badge">
                        {Math.max(0, GUEST_FREE_LIMIT - guestCount)} of {GUEST_FREE_LIMIT} remaining
                      </span>
                    </span>
                    <button
                      type="button"
                      className="inline-login-btn"
                      onClick={() => {
                        setAuthPromptNotice("Create a free account for 10 questions every 4 hours.");
                        setShowAuthModal(true);
                      }}
                    >
                      Create a free account →
                    </button>
                  </div>
                )}
              </>
            )}

            <div className="input-box">
              <textarea
                placeholder={
                  cooldownRemaining > 0
                    ? `⏳ AI limit exceeded. Please wait ${formatWaitTime(cooldownRemaining)} or log in...`
                    : "Type your legal question here..."
                }
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading || cooldownRemaining > 0}
              />

              <div className="input-bottom">
                <span className="attach">📎</span>

                <button
                  className="send-button"
                  onClick={() => askQuestion()}
                  disabled={loading || cooldownRemaining > 0}
                  title={cooldownRemaining > 0 ? `Wait ${formatWaitTime(cooldownRemaining)} or Log In` : "Send question"}
                >
                  {cooldownRemaining > 0 ? "⏳" : "➤"}
                </button>
              </div>
            </div>

            {!user ? (
              <p className="disclaimer guest-hint">
                ⚖ Guest Mode: Normal answers • Answers are not saved.{" "}
                <button
                  type="button"
                  className="inline-login-btn"
                  onClick={() => {
                    setAuthPromptNotice("Log in to save your questions and chat history.");
                    setShowAuthModal(true);
                  }}
                >
                  Log in to save chats
                </button>
              </p>
            ) : (
              <p className="disclaimer">
                ⚖ This assistant provides general legal information and does
                not replace professional legal advice.
              </p>
            )}
          </div>
        )}
      </main>

      {/* RIGHT PANEL */}
      <aside className="right-panel">
        <div className="info-card">
          <div className="info-heading">
            <div className="info-icon">📖</div>
            <h3>Knowledge-Base Sources</h3>
          </div>

          <p>
            Answers are generated using legal information available in the
            assistant's knowledge base.
          </p>
        </div>

        <div className="info-card">
          <div className="info-heading">
            <div className="info-icon">◷</div>
            <h3>Chat History</h3>
          </div>

          <p>
            Previous questions and answers can be opened again from your
            recent chats.
          </p>
        </div>

        <div className="info-card">
          <div className="info-heading">
            <div className="info-icon gold">
              <img src={legalLogo} alt="Legal Guidance" />
            </div>

            <h3>General Guidance</h3>
          </div>

          <p>
            This assistant provides general legal information and does not
            replace professional legal advice.
          </p>
        </div>

        <div className="quote-card">
          <div className="quote">“</div>

          <h3>
            Justice delayed is
            <br />
            justice denied.
          </h3>

          <p>— William E. Gladstone</p>

          <div className="quote-logo">
            <img src={legalLogo} alt="" />
          </div>
        </div>
      </aside>

      {/* ========================= */}
      {/* AUTH MODAL */}
      {/* ========================= */}
      {showAuthModal && (
        <div
          className="auth-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowAuthModal(false);
            }
          }}
        >
          <div className="auth-card modal-mode">
            <button
              type="button"
              className="auth-modal-close"
              onClick={() => setShowAuthModal(false)}
              title="Close and continue as guest"
            >
              ✕
            </button>

            <div className="auth-brand">
              <img src={legalLogo} alt="AI Legal Assistant logo" />

              <div>
                <h2>AI LEGAL ASSISTANT</h2>
                <p>Your Rights. Our Support.</p>
              </div>
            </div>

            <h1 className="auth-heading">
              {authMode === "login"
                ? "Welcome Back"
                : "Create Your Account"}
            </h1>

            <p className="auth-description">
              {authMode === "login"
                ? "Log in for 10 free questions every 4 hours, plus saved chats and answer history."
                : "Create a free account for 10 questions every 4 hours and cloud chat saving."}
            </p>

            {authPromptNotice && (
              <div className="auth-prompt-notice">
                <span>🔒</span>
                <span>{authPromptNotice}</span>
              </div>
            )}

            {authMessage && (
              <div
                className={`auth-message ${authSuccess ? "success" : ""}`}
                role="status"
              >
                {authMessage}
              </div>
            )}

            <form className="auth-form" onSubmit={handleAuthSubmit}>
              {authMode === "signup" && (
                <div className="auth-field">
                  <label htmlFor="auth-name">Full Name</label>
                  <input
                    id="auth-name"
                    type="text"
                    placeholder="Enter your full name"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    autoComplete="name"
                    required
                  />
                </div>
              )}

              <div className="auth-field">
                <label htmlFor="auth-email">Email Address</label>
                <input
                  id="auth-email"
                  type="email"
                  placeholder="Enter your email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              <div className="auth-field">
                <label htmlFor="auth-password">Password</label>
                <input
                  id="auth-password"
                  type="password"
                  placeholder="Enter your password (min. 8 characters)"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  autoComplete={
                    authMode === "login"
                      ? "current-password"
                      : "new-password"
                  }
                  required
                />
              </div>

              {authMode === "signup" && (
                <div className="auth-field">
                  <label htmlFor="confirm-password">
                    Confirm Password
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={(e) =>
                      setConfirmPassword(e.target.value)
                    }
                    autoComplete="new-password"
                    required
                  />
                </div>
              )}

              <button
                className="auth-submit"
                type="submit"
                disabled={authLoading}
              >
                {authLoading
                  ? "Please wait..."
                  : authMode === "login"
                    ? "Log In"
                    : "Create Free Account"}
              </button>
            </form>

            <p className="auth-switch">
              {authMode === "login"
                ? "Don't have an account? "
                : "Already have an account? "}

              <button
                type="button"
                onClick={() =>
                  switchAuthMode(
                    authMode === "login" ? "signup" : "login"
                  )
                }
              >
                {authMode === "login" ? "Sign Up" : "Log In"}
              </button>
            </p>

            <p className="auth-footer">
              <span>⚖</span> General legal information for educational
              purposes. Not a substitute for advice from a qualified lawyer.
            </p>
          </div>
        </div>
      )}

      {/* ========================= */}
      {/* PREMIUM PAYWALL MODAL */}
      {/* ========================= */}
      {showPaywallModal && (
        <div
          className="auth-modal-backdrop paywall-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !purchaseLoading) setShowPaywallModal(false);
          }}
        >
          <div className="paywall-modal">
            {!purchaseSuccess ? (
              <>
                <button
                  type="button"
                  className="auth-modal-close"
                  onClick={() => setShowPaywallModal(false)}
                  disabled={purchaseLoading}
                >
                  ✕
                </button>

                <div className="paywall-header">
                  <div className="paywall-icon">⚖</div>
                  <h2>You've Used All {USER_WINDOW_LIMIT} Free Questions</h2>
                  <p>Your free allowance refreshes in 4 hours. Upgrade to <strong>AI Legal Assistant Premium</strong> for uninterrupted access.</p>
                </div>

                <div className="paywall-plans">
                  <div className="paywall-plan featured">
                    <div className="plan-badge">✦ Most Popular</div>
                    <h3>Monthly Plan</h3>
                    <div className="plan-price">
                      <span className="price-amount">₹299</span>
                      <span className="price-period">/ month</span>
                    </div>
                    <ul className="plan-features">
                      <li>✓ Unlimited AI legal questions</li>
                      <li>✓ Detailed in-depth explanations</li>
                      <li>✓ Full chat history (MongoDB)</li>
                      <li>✓ Save unlimited answers</li>
                      <li>✓ Priority response speed</li>
                      <li>✓ Cancel anytime</li>
                    </ul>
                    <button
                      type="button"
                      className="paywall-cta-btn"
                      onClick={handlePurchasePremium}
                      disabled={purchaseLoading}
                    >
                      {purchaseLoading ? "Processing..." : "⚡ Activate Premium — ₹299/mo"}
                    </button>
                    <p className="paywall-demo-note">🔒 Demo mode: No real payment required</p>
                  </div>
                </div>

                <div className="paywall-footer">
                  <p>You have used <strong>{userStatus.windowQuestionsUsed}</strong> of your <strong>{USER_WINDOW_LIMIT}</strong> free questions.</p>
                  <p className="paywall-legal-note">⚖ AI Legal Assistant provides general information only. Not a substitute for qualified legal advice.</p>
                </div>
              </>
            ) : (
              <div className="paywall-success">
                <div className="paywall-success-icon">🎉</div>
                <h2>Premium Activated!</h2>
                <p>Welcome to <strong>AI Legal Assistant Premium</strong>. You now have unlimited access to legal guidance.</p>
                <div className="paywall-success-details">
                  <span>✦ Unlimited questions</span>
                  <span>✦ Full detailed answers</span>
                  <span>✦ 30-day subscription</span>
                </div>
                <button
                  type="button"
                  className="paywall-cta-btn"
                  onClick={() => setShowPaywallModal(false)}
                >
                  Start Asking Questions →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
