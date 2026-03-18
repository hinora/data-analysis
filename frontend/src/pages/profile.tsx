/**
 * Profile Page (Protected)
 *
 * Shows user info with ability to edit nickName and photo.
 * Redirects to /login if not authenticated.
 */

import { useRouter } from "next/router";
import type React from "react";
import { useEffect, useState } from "react";
import { useLogout, useProfile, useUpdateProfile } from "@/hooks/useAuth";
import { getToken } from "@/utils/auth";

const ProfilePage: React.FC = () => {
  const router = useRouter();
  const token = getToken();
  const { data: profile, isLoading } = useProfile();
  const { mutate: updateProfile, isPending: isUpdating } = useUpdateProfile();
  const { mutate: logout } = useLogout();

  const [error, setError] = useState("");
  const [nickName, setNickName] = useState("");
  const [photo, setPhoto] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!token) {
      router.replace("/login");
    }
  }, [token, router]);

  useEffect(() => {
    if (profile) {
      setNickName(profile.nickName);
      setPhoto(profile.photo ?? "");
    }
  }, [profile]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    updateProfile(
      { nickName, photo: photo || undefined },
      {
        onError: (err: unknown) => {
          const message =
            (err as { response?: { data?: { message?: string } } })?.response
              ?.data?.message ?? "Failed to update profile. Please try again.";
          setError(message);
        },
        onSuccess: () => {
          setSuccess("Profile updated successfully.");
        },
      },
    );
  };

  const handleLogout = () => {
    logout(undefined, {
      onSuccess: () => {
        router.push("/login");
      },
    });
  };

  if (!token) {
    return null;
  }

  if (isLoading) {
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
        <p style={{ color: "#6b7280" }}>Loading profile...</p>
      </div>
    );
  }

  if (!profile) {
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
        <p style={{ color: "#6b7280" }}>Unable to load profile.</p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        minHeight: "100%",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          padding: 32,
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          backgroundColor: "#fff",
          marginTop: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 24,
          }}
        >
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Profile</h1>
          <button
            type="button"
            onClick={handleLogout}
            style={{
              backgroundColor: "#fff",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              color: "#dc2626",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 500,
              padding: "6px 14px",
            }}
          >
            Logout
          </button>
        </div>

        <div
          style={{
            backgroundColor: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 6,
            marginBottom: 24,
            padding: 16,
          }}
        >
          <div style={{ marginBottom: 8 }}>
            <span style={{ color: "#6b7280", fontSize: 12, fontWeight: 500 }}>
              Email
            </span>
            <p style={{ fontSize: 14, margin: "2px 0 0" }}>{profile.email}</p>
          </div>
          <div style={{ marginBottom: 8 }}>
            <span style={{ color: "#6b7280", fontSize: 12, fontWeight: 500 }}>
              Status
            </span>
            <p style={{ fontSize: 14, margin: "2px 0 0" }}>
              {profile.isVerified ? "✓ Verified" : "Not verified"}
              {" · "}
              {profile.isActive ? "Active" : "Inactive"}
            </p>
          </div>
          {profile.createdAt && (
            <div>
              <span style={{ color: "#6b7280", fontSize: 12, fontWeight: 500 }}>
                Member since
              </span>
              <p style={{ fontSize: 14, margin: "2px 0 0" }}>
                {new Date(profile.createdAt).toLocaleDateString()}
              </p>
            </div>
          )}
        </div>

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

        <form onSubmit={handleSave}>
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
              htmlFor="photo"
              style={{
                display: "block",
                fontSize: 14,
                fontWeight: 500,
                marginBottom: 4,
              }}
            >
              Photo URL
            </label>
            <input
              id="photo"
              type="text"
              value={photo}
              onChange={(e) => setPhoto(e.target.value)}
              placeholder="https://example.com/photo.jpg"
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
            disabled={isUpdating}
            style={{
              backgroundColor: "#3b82f6",
              border: "none",
              borderRadius: 6,
              color: "#fff",
              cursor: isUpdating ? "not-allowed" : "pointer",
              fontSize: 14,
              fontWeight: 500,
              opacity: isUpdating ? 0.7 : 1,
              padding: "10px 16px",
              width: "100%",
            }}
          >
            {isUpdating ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ProfilePage;
