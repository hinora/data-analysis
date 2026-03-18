/**
 * Register Page
 *
 * Provides email, password, confirm password, and nickName fields
 * with client-side validation and link to login.
 */

import Link from "next/link";
import { useRouter } from "next/router";
import type React from "react";
import { useState } from "react";
import { useRegister } from "@/hooks/useAuth";

const RegisterPage: React.FC = () => {
  const router = useRouter();
  const { mutate: register, isPending } = useRegister();
  const [confirmPassword, setConfirmPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [nickName, setNickName] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password || !confirmPassword || !nickName) {
      setError("Please fill in all fields.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    register(
      { email, nickName, password },
      {
        onError: (err: unknown) => {
          const message =
            (err as { response?: { data?: { message?: string } } })?.response
              ?.data?.message ?? "Registration failed. Please try again.";
          setError(message);
        },
        onSuccess: () => {
          router.push("/sessions");
        },
      },
    );
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100%",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          padding: 32,
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          backgroundColor: "#fff",
        }}
      >
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            marginBottom: 8,
            marginTop: 0,
            textAlign: "center",
          }}
        >
          Create Account
        </h1>
        <p
          style={{
            color: "#6b7280",
            fontSize: 14,
            marginBottom: 24,
            textAlign: "center",
          }}
        >
          Sign up to get started
        </p>

        {error && (
          <div
            style={{
              backgroundColor: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 6,
              color: "#dc2626",
              fontSize: 14,
              marginBottom: 16,
              padding: "8px 12px",
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="nickName"
              style={{
                display: "block",
                fontSize: 14,
                fontWeight: 500,
                marginBottom: 4,
              }}
            >
              Nick Name
            </label>
            <input
              id="nickName"
              type="text"
              value={nickName}
              onChange={(e) => setNickName(e.target.value)}
              placeholder="Your display name"
              style={{
                border: "1px solid #d1d5db",
                borderRadius: 6,
                fontSize: 14,
                padding: "8px 12px",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="email"
              style={{
                display: "block",
                fontSize: 14,
                fontWeight: 500,
                marginBottom: 4,
              }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                border: "1px solid #d1d5db",
                borderRadius: 6,
                fontSize: 14,
                padding: "8px 12px",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="password"
              style={{
                display: "block",
                fontSize: 14,
                fontWeight: 500,
                marginBottom: 4,
              }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              style={{
                border: "1px solid #d1d5db",
                borderRadius: 6,
                fontSize: 14,
                padding: "8px 12px",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label
              htmlFor="confirmPassword"
              style={{
                display: "block",
                fontSize: 14,
                fontWeight: 500,
                marginBottom: 4,
              }}
            >
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              style={{
                border: "1px solid #d1d5db",
                borderRadius: 6,
                fontSize: 14,
                padding: "8px 12px",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            style={{
              backgroundColor: "#3b82f6",
              border: "none",
              borderRadius: 6,
              color: "#fff",
              cursor: isPending ? "not-allowed" : "pointer",
              fontSize: 14,
              fontWeight: 500,
              opacity: isPending ? 0.7 : 1,
              padding: "10px 16px",
              width: "100%",
            }}
          >
            {isPending ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <div style={{ marginTop: 16, textAlign: "center" }}>
          <span style={{ color: "#6b7280", fontSize: 14 }}>
            Already have an account?{" "}
            <Link href="/login" style={{ color: "#3b82f6" }}>
              Sign in
            </Link>
          </span>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
