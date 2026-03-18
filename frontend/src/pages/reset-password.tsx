/**
 * Reset Password Page
 *
 * Allows user to set a new password using a reset token from query params.
 */

import Link from "next/link";
import { useRouter } from "next/router";
import type React from "react";
import { useState } from "react";
import { useResetPassword } from "@/hooks/useAuth";

const ResetPasswordPage: React.FC = () => {
  const router = useRouter();
  const { token } = router.query;
  const { mutate: resetPassword, isPending } = useResetPassword();
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!token || typeof token !== "string") {
      setError("Invalid or missing reset token.");
      return;
    }

    if (!password || !confirmPassword) {
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

    resetPassword(
      { password, token },
      {
        onError: (err: unknown) => {
          const message =
            (err as { response?: { data?: { message?: string } } })?.response
              ?.data?.message ??
            "Failed to reset password. Please try again.";
          setError(message);
        },
        onSuccess: (data) => {
          setSuccess(
            data.message ?? "Password has been reset successfully.",
          );
          setPassword("");
          setConfirmPassword("");
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
          Reset Password
        </h1>
        <p
          style={{
            color: "#6b7280",
            fontSize: 14,
            marginBottom: 24,
            textAlign: "center",
          }}
        >
          Enter your new password
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
            <div style={{ marginTop: 8 }}>
              <Link href="/login" style={{ color: "#16a34a", fontWeight: 500 }}>
                Go to Sign In
              </Link>
            </div>
          </div>
        )}

        {!success && (
          <form onSubmit={handleSubmit}>
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
                New Password
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
                Confirm New Password
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
              {isPending ? "Resetting..." : "Reset Password"}
            </button>
          </form>
        )}

        <div style={{ marginTop: 16, textAlign: "center" }}>
          <Link href="/login" style={{ color: "#3b82f6", fontSize: 14 }}>
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
