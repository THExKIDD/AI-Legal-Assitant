import React, { useState } from "react";
import legalLogo from "./assets/legal-logo.png";

export function Auth({ onLoginSuccess }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("error");
  const [loading, setLoading] = useState(false);

  function resetForm() {
    setName("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setMessage("");
  }

  function handleSwitchMode(signUpMode) {
    setIsSignUp(signUpMode);
    resetForm();
  }

  // Quick button action for "Normal User"
  async function handleNormalUserQuickAccess() {
    setLoading(true);
    setMessage("");

    const normalUserEmail = "user@legalassistant.ai";
    const normalUserPass = "normaluser123";

    try {
      // First try to login as Normal User
      const loginRes = await fetch("http://localhost:5000/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalUserEmail,
          password: normalUserPass
        })
      });

      const loginData = await loginRes.json();

      if (loginRes.ok && (loginData.success !== false)) {
        const userData = loginData.user || {
          _id: loginData.userId,
          name: loginData.name || "Normal User",
          email: normalUserEmail,
          role: "Normal User"
        };
        onLoginSuccess(userData);
        return;
      }

      // If user does not exist yet, register Normal User in MongoDB
      const signupRes = await fetch("http://localhost:5000/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Normal User",
          email: normalUserEmail,
          password: normalUserPass,
          role: "Normal User"
        })
      });

      const signupData = await signupRes.json();

      if (signupRes.ok && signupData.success !== false) {
        const userData = signupData.user || {
          _id: signupData.user?._id,
          name: "Normal User",
          email: normalUserEmail,
          role: "Normal User"
        };
        onLoginSuccess(userData);
      } else {
        // Fallback local session if server registration was already handled
        onLoginSuccess({
          _id: "demo-normal-user",
          name: "Normal User",
          email: normalUserEmail,
          role: "Normal User"
        });
      }
    } catch (err) {
      console.warn("Server unavailable for quick access, entering demo mode:", err);
      onLoginSuccess({
        _id: "guest-normal-user",
        name: "Normal User",
        email: normalUserEmail,
        role: "Normal User"
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage("");

    const cleanEmail = email.trim();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setMessageType("error");
      setMessage("Please fill in all required fields.");
      return;
    }

    if (isSignUp) {
      // Condition check for signup: ensure credentials are valid and passwords match
      if (!name.trim()) {
        setMessageType("error");
        setMessage("Please provide your name.");
        return;
      }

      if (cleanPassword.length < 8) {
        setMessageType("error");
        setMessage("Password must contain at least 8 characters.");
        return;
      }

      // Condition: credentials/passwords must match
      if (cleanPassword !== confirmPassword.trim()) {
        setMessageType("error");
        setMessage("Passwords do not match. Please ensure both passwords are the same.");
        return;
      }

      setLoading(true);

      try {
        const response = await fetch("http://localhost:5000/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            email: cleanEmail,
            password: cleanPassword,
            role: "Normal User"
          })
        });

        const data = await response.json();

        if (!response.ok || data.success === false) {
          setMessageType("error");
          setMessage(data.message || "Failed to create account.");
          setLoading(false);
          return;
        }

        // Successfully saved in MongoDB!
        setMessageType("success");
        setMessage("Account created in MongoDB! Logging you in...");

        // Automatically log in
        try {
          const autoLoginRes = await fetch("http://localhost:5000/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: cleanEmail,
              password: cleanPassword
            })
          });

          const autoData = await autoLoginRes.json();
          if (autoLoginRes.ok && autoData.userId) {
            setTimeout(() => {
              onLoginSuccess({
                _id: autoData.userId,
                name: autoData.name || name.trim(),
                email: autoData.email || cleanEmail,
                role: "Normal User"
              });
            }, 600);
            return;
          }
        } catch {
          // fallback below
        }

        setTimeout(() => {
          const userData = {
            name: name.trim(),
            email: cleanEmail,
            role: "Normal User"
          };
          onLoginSuccess(userData);
        }, 700);

      } catch (err) {
        setMessageType("error");
        setMessage("Unable to connect to the server. Please ensure the backend is running.");
        setLoading(false);
      }

    } else {
      // Login flow: check credentials against MongoDB
      setLoading(true);

      try {
        const response = await fetch("http://localhost:5000/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: cleanEmail,
            password: cleanPassword
          })
        });

        const data = await response.json();

        if (!response.ok || data.success === false) {
          setMessageType("error");
          setMessage(data.message || "Invalid email or password.");
          setLoading(false);
          return;
        }

        // Credentials matched!
        setMessageType("success");
        setMessage("Login successful! Welcome back.");

        setTimeout(() => {
          const userData = data.user || {
            _id: data.userId,
            name: data.name || "Normal User",
            email: cleanEmail,
            role: data.role || "Normal User"
          };
          onLoginSuccess(userData);
        }, 500);

      } catch (err) {
        setMessageType("error");
        setMessage("Unable to connect to the server. Please ensure the backend is running.");
        setLoading(false);
      }
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <img src={legalLogo} alt="AI Legal Assistant" />
          <div>
            <h2>AI LEGAL ASSISTANT</h2>
            <p>Your Rights. Our Support.</p>
          </div>
        </div>

        <h1 className="auth-heading">
          {isSignUp ? "Create Account" : "Welcome Back"}
        </h1>

        <p className="auth-description">
          {isSignUp
            ? "Sign up with your credentials to access legal guidance and save chat history in MongoDB."
            : "Enter your registered credentials to access your legal assistant."}
        </p>

        {message && (
          <div className={`auth-message ${messageType === "success" ? "success" : ""}`}>
            {message}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          {isSignUp && (
            <div className="auth-field">
              <label>Full Name</label>
              <input
                type="text"
                placeholder="e.g. Rahul Sharma"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="auth-field">
            <label>Email Address</label>
            <input
              type="email"
              placeholder="e.g. user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="auth-field">
            <label>Password</label>
            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {isSignUp && (
            <div className="auth-field">
              <label>Confirm Password</label>
              <input
                type="password"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          )}

          <button
            className="auth-submit"
            type="submit"
            disabled={loading}
          >
            {loading ? "Verifying..." : isSignUp ? "Sign Up & Save to Database" : "Log In"}
          </button>

          {/* Click Button on Normal User */}
          <button
            type="button"
            className="quick-user-btn"
            onClick={handleNormalUserQuickAccess}
            disabled={loading}
          >
            <span>👤</span>
            <span>Continue as Normal User</span>
          </button>
        </form>

        <div className="auth-switch">
          {isSignUp ? (
            <span>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => handleSwitchMode(false)}
              >
                Log In
              </button>
            </span>
          ) : (
            <span>
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => handleSwitchMode(true)}
              >
                Sign Up
              </button>
            </span>
          )}
        </div>

        <div className="auth-footer">
          ⚖ AI Legal Assistant is for educational and information purposes only.
        </div>
      </div>
    </div>
  );
}

export default Auth;
