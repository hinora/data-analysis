/**
 * Profile Page
 */

import type React from "react";
import { useEffect, useState } from "react";
import { useGetProfile, useLogout, useUpdateProfile } from "@/hooks/useAuth";

const ProfilePage: React.FC = () => {
  const { data: user, isLoading } = useGetProfile();
  const { mutate: updateProfile, isPending: isUpdating } = useUpdateProfile();
  const { logout } = useLogout();
  const [nickName, setNickName] = useState("");
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) {
      setNickName(user.nickName);
    }
  }, [user]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);
    updateProfile(
      { nickName },
      {
        onSuccess: () => {
          setSuccess(true);
          setTimeout(() => setSuccess(false), 3000);
        },
        onError: () => {
          setError("Failed to update profile.");
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div style={{ maxWidth: 500, margin: "40px auto", padding: 24 }}>
        <p style={{ color: "#6b7280" }}>Loading profile...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 500, margin: "40px auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>
        Profile
      </h1>

      {success && (
        <div
          style={{
            padding: "8px 12px",
            backgroundColor: "#f0fdf4",
            color: "#166534",
            borderRadius: 6,
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          Profile updated successfully!
        </div>
      )}

      {error && (
        <div
          style={{
            padding: "8px 12px",
            backgroundColor: "#fef2f2",
            color: "#dc2626",
            borderRadius: 6,
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          padding: 24,
          marginBottom: 24,
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <span
            style={{ fontSize: 13, color: "#6b7280", display: "block" }}
          >
            Email
          </span>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{user?.email}</span>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="nickName"
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                marginBottom: 4,
                color: "#374151",
              }}
            >
              Display Name
            </label>
            <input
              id="nickName"
              type="text"
              value={nickName}
              onChange={(e) => setNickName(e.target.value)}
              required
              maxLength={100}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #d1d5db",
                borderRadius: 6,
                fontSize: 14,
                outline: "none",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isUpdating}
            style={{
              padding: "8px 16px",
              backgroundColor: "#3b82f6",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 500,
              cursor: isUpdating ? "not-allowed" : "pointer",
              opacity: isUpdating ? 0.7 : 1,
            }}
          >
            {isUpdating ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </div>

      <button
        type="button"
        onClick={logout}
        style={{
          padding: "8px 16px",
          backgroundColor: "#fff",
          color: "#dc2626",
          border: "1px solid #fecaca",
          borderRadius: 6,
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        Sign Out
      </button>
    </div>
  );
};

export default ProfilePage;
