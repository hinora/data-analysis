/**
 * Database Types
 */
import type { ConnectOptions } from "mongoose";

export interface DatabaseConfig {
  /**
   * MongoDB connection URI
   * @example mongodb://localhost:27017/mydb
   */
  uri: string;

  /**
   * Mongoose connection options
   */
  options?: ConnectOptions;
}

export interface DatabaseConnection {
  /**
   * Connect to the database
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the database
   */
  disconnect(): Promise<void>;

  /**
   * Check if connected to the database
   */
  isConnected(): boolean;
}
