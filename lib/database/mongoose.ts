/**
 * Mongoose Database Connection Helper
 */
import mongoose from "mongoose";
import type { DatabaseConfig, DatabaseConnection } from "./types";

let isConnected = false;

/**
 * Create a database connection
 * @param config - Database configuration
 * @returns Database connection object
 */
export function createDatabase(config: DatabaseConfig): DatabaseConnection {
  return {
    async connect() {
      if (isConnected) {
        console.log("Database already connected");
        return;
      }

      try {
        const defaultOptions = {
          maxPoolSize: 10,
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 45000,
        };

        await mongoose.connect(config.uri, {
          ...defaultOptions,
          ...config.options,
        });

        isConnected = true;
        console.log(
          `✅ Database connected: ${config.uri.split("@").pop() || config.uri.split("/").pop()}`,
        );

        mongoose.connection.on("error", (err: Error) => {
          console.error("MongoDB connection error:", err);
          isConnected = false;
        });

        mongoose.connection.on("disconnected", () => {
          console.log("MongoDB disconnected");
          isConnected = false;
        });
      } catch (error) {
        console.error("❌ Database connection failed:", error);
        throw error;
      }
    },

    async disconnect() {
      if (!isConnected) {
        return;
      }

      try {
        await mongoose.disconnect();
        isConnected = false;
        console.log("Database disconnected");
      } catch (error) {
        console.error("Error disconnecting from database:", error);
        throw error;
      }
    },

    isConnected() {
      return isConnected && mongoose.connection.readyState === 1;
    },
  };
}

/**
 * Get the mongoose instance for advanced usage
 */
export function getMongoose() {
  return mongoose;
}

/**
 * Get the current database connection
 */
export function getConnection() {
  return mongoose.connection;
}

/**
 * Create a database URI from environment variables
 * @param dbName - Database name
 * @returns MongoDB connection URI
 */
export function createDatabaseUri(dbName: string): string {
  const host = process.env.MONGODB_HOST || "localhost";
  const port = process.env.MONGODB_PORT || "27017";
  const user = process.env.MONGODB_USER;
  const password = process.env.MONGODB_PASSWORD;

  if (user && password) {
    return `mongodb://${user}:${password}@${host}:${port}/${dbName}?authSource=admin`;
  }

  return `mongodb://${host}:${port}/${dbName}`;
}
