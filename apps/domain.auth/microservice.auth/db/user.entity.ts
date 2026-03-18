/**
 * User TypeORM Entity
 *
 * Represents an authenticated user in the system.
 * Stores credentials, profile information, and password reset state.
 */

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("users")
@Index("idx_users_email", ["email"], { unique: true })
@Index("idx_users_createdAt", ["createdAt"])
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ length: 255, type: "varchar", unique: true })
  email: string;

  @Column({ length: 255, type: "varchar" })
  passwordHash: string;

  @Column({ length: 100, type: "varchar" })
  nickName: string;

  @Column({ length: 500, nullable: true, type: "varchar" })
  photo: string | null;

  @Column({ default: true, type: "boolean" })
  isActive: boolean;

  @Column({ default: false, type: "boolean" })
  isVerified: boolean;

  @Column({ length: 255, nullable: true, type: "varchar" })
  resetToken: string | null;

  @Column({ nullable: true, type: "timestamptz" })
  resetTokenExpiry: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt: Date;
}
