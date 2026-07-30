import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export type ContestType = 'dsa' | 'domain' | 'quant';
export type ContestComplexity = 'easy' | 'medium' | 'hard';

export interface ContestAttributes {
  id: string;
  type: ContestType;
  complexity: ContestComplexity;
  title: string;
  description: string | null;
  timeLimitMinutes: number;
  /**
   * Unpublished contests stay fully intact but are invisible to candidates —
   * enforced by RLS (contests_select_published), not just by the query. See
   * migrations/20240110000001-contest-module.js.
   */
  published: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type ContestCreationAttributes = Optional<
  ContestAttributes,
  'id' | 'description' | 'timeLimitMinutes' | 'published' | 'createdAt' | 'updatedAt'
>;

export class Contest
  extends Model<ContestAttributes, ContestCreationAttributes>
  implements ContestAttributes
{
  declare id: string;
  declare type: ContestType;
  declare complexity: ContestComplexity;
  declare title: string;
  declare description: string | null;
  declare timeLimitMinutes: number;
  declare published: boolean;
  declare createdAt: Date;
  declare updatedAt: Date;
}

Contest.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    type: { type: DataTypes.ENUM('dsa', 'domain', 'quant'), allowNull: false },
    complexity: { type: DataTypes.ENUM('easy', 'medium', 'hard'), allowNull: false },
    title: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    timeLimitMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 30,
      field: 'time_limit_minutes',
    },
    published: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'updated_at' },
  },
  { sequelize, modelName: 'Contest', tableName: 'contests', timestamps: false },
);
