import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export type JobRoundType = 'coding' | 'mcq' | 'interview' | 'custom';

export interface JobRoundAttributes {
  id: string;
  jobId: string;
  roundName: string;
  roundOrder: number;
  roundType: JobRoundType;
  createdAt: Date;
  updatedAt: Date;
}

type JobRoundCreationAttributes = Optional<
  JobRoundAttributes,
  'id' | 'roundOrder' | 'createdAt' | 'updatedAt'
>;

export class JobRound extends Model<JobRoundAttributes, JobRoundCreationAttributes> implements JobRoundAttributes {
  declare id: string;
  declare jobId: string;
  declare roundName: string;
  declare roundOrder: number;
  declare roundType: JobRoundType;
  declare createdAt: Date;
  declare updatedAt: Date;
}

JobRound.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    jobId: { type: DataTypes.UUID, allowNull: false, field: 'job_id' },
    roundName: { type: DataTypes.STRING, allowNull: false, field: 'round_name' },
    roundOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'round_order' },
    roundType: { type: DataTypes.ENUM('coding', 'mcq', 'interview', 'custom'), allowNull: false, field: 'round_type' },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'updated_at' },
  },
  { sequelize, modelName: 'JobRound', tableName: 'job_rounds', timestamps: false },
);
