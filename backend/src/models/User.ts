import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export type UserRole = 'candidate' | 'company' | 'verifier' | 'admin';

export interface UserAttributes {
  id: string;
  role: UserRole;
  email: string;
  passwordHash: string | null;
  googleId: string | null;
  phone: string | null;
  fullName: string | null;
  createdAt: Date;
}

type UserCreationAttributes = Optional<
  UserAttributes,
  'id' | 'passwordHash' | 'googleId' | 'phone' | 'fullName' | 'createdAt'
>;

export class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  declare id: string;
  declare role: UserRole;
  declare email: string;
  declare passwordHash: string | null;
  declare googleId: string | null;
  declare phone: string | null;
  declare fullName: string | null;
  declare readonly createdAt: Date;
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    role: {
      type: DataTypes.ENUM('candidate', 'company', 'verifier', 'admin'),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
    },
    passwordHash: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'password_hash',
    },
    googleId: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'google_id',
      unique: true,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    fullName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'full_name',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
  },
  {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    timestamps: false,
  },
);
