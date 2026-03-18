/**
 * Forgot Password Page
 *
 * Allows user to request a password reset email.
 */

import Link from "next/link";
import type React from "react";
import { useState } from "react";
import { useForgotPassword } from "@/hooks/useAuth";

const ForgotPasswordPage: React.FC = () => {
  const { mutate: forgotPassword, isPending } = useForgotPassword();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!email) {
      setError("Please enter your email address.");
      return;
    }

    forgotPassword(
      { email },
      {
        onError: (err: unknown) => {
          const message =
            (err as { response?: { data?: { message?: string } } })?.response
              ?.data?.message ??
            "Failed to send reset email. Please try again.";
          setError(message);
        },
        onSuccess: (data) => {
          setSuccess(
            data.message ??
              "If an account with that email exists, a reset link has been sent.",
          );
          setEmail("");
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
          Forgot Password
        </h1>
        <p
          style={{
            color: "#6b7280",
            fontSize: 14,
            marginBottom: 24,
            textAlign: "center",
          }}
        >
          Enter your email to receive a password reset link
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

        {success && (
          <div
            style={{
              backgroundColor: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: 6,
              color: "#16a34a",
              fontSize: 14,
              marginBottom: 16,
              padding: "8px 12px",
            }}
          >
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 24 }}>
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
            {isPending ? "Sending..." : "Send Reset Link"}
          </button>
        </form>

        <div style={{ marginTop: 16, textAlign: "center" }}>
          <Link href="/login" style={{ color: "#3b82f6", fontSize: 14 }}>
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
