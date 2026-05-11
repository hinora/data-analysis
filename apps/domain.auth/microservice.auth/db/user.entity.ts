/**
 * User TypeORM Entity
 *
 * Stores user credentials and profile information for authentication.
 * Passwords are stored as bcrypt hashes.
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
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ length: 255, type: "varchar", unique: true })
  @Index("idx_users_email")
  email: string;

  @Column({ length: 255, type: "varchar" })
  password: string;

  @Column({ length: 100, type: "varchar" })
  nickName: string;

  @Column({ default: true, type: "boolean" })
  isActive: boolean;

  @Column({ default: false, type: "boolean" })
  isVerified: boolean;

  @Column({ length: 500, nullable: true, type: "varchar" })
  photo: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt: Date;
}
