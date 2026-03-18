/**
 * Login Page
 *
 * Provides email/password login with links to register and forgot password.
 */

import Link from "next/link";
import { useRouter } from "next/router";
import type React from "react";
import { useState } from "react";
import { useLogin } from "@/hooks/useAuth";

const LoginPage: React.FC = () => {
  const router = useRouter();
  const { mutate: login, isPending } = useLogin();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    login(
      { email, password },
      {
        onError: (err: unknown) => {
          const message =
            (err as { response?: { data?: { message?: string } } })?.response
              ?.data?.message ?? "Login failed. Please try again.";
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
          Sign In
        </h1>
        <p
          style={{
            color: "#6b7280",
            fontSize: 14,
            marginBottom: 24,
            textAlign: "center",
          }}
        >
          Enter your credentials to continue
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

          <div style={{ marginBottom: 24 }}>
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
              placeholder="••••••••"
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
            {isPending ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            marginTop: 16,
          }}
        >
          <Link
            href="/forgot-password"
            style={{ color: "#3b82f6", fontSize: 14 }}
          >
            Forgot your password?
          </Link>
          <span style={{ color: "#6b7280", fontSize: 14 }}>
            Don&apos;t have an account?{" "}
            <Link href="/register" style={{ color: "#3b82f6" }}>
              Sign up
            </Link>
          </span>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
