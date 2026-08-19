import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export interface FunctionSignature {
  parameters: { name: string; type: string }[];
  returnType: string;
}

export interface CustomCodingQuestionAttributes {
  id: string;
  companyId: string;
  jobId: string | null;
  title: string;
  description: string;
  functionSignature: FunctionSignature;
  starterCode: Record<string, string>;
  sampleTestCases: { stdin: string; expectedOutput: string; explanation?: string }[];
  hiddenTestCases: { stdin: string; expectedOutput: string }[];
  languageSupport: string[];
  isSql: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type CustomCodingQuestionCreationAttributes = Optional<
  CustomCodingQuestionAttributes,
  | 'id'
  | 'jobId'
  | 'starterCode'
  | 'sampleTestCases'
  | 'hiddenTestCases'
  | 'languageSupport'
  | 'isSql'
  | 'createdAt'
  | 'updatedAt'
>;

export class CustomCodingQuestion
  extends Model<CustomCodingQuestionAttributes, CustomCodingQuestionCreationAttributes>
  implements CustomCodingQuestionAttributes
{
  declare id: string;
  declare companyId: string;
  declare jobId: string | null;
  declare title: string;
  declare description: string;
  declare functionSignature: FunctionSignature;
  declare starterCode: Record<string, string>;
  declare sampleTestCases: { stdin: string; expectedOutput: string; explanation?: string }[];
  declare hiddenTestCases: { stdin: string; expectedOutput: string }[];
  declare languageSupport: string[];
  declare isSql: boolean;
  declare createdAt: Date;
  declare updatedAt: Date;
}

CustomCodingQuestion.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    companyId: { type: DataTypes.UUID, allowNull: false, field: 'company_id' },
    jobId: { type: DataTypes.UUID, allowNull: true, field: 'job_id' },
    title: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    functionSignature: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      field: 'function_signature',
    },
    starterCode: { type: DataTypes.JSONB, allowNull: false, defaultValue: {}, field: 'starter_code' },
    sampleTestCases: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'sample_test_cases',
    },
    hiddenTestCases: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'hidden_test_cases',
    },
    languageSupport: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'language_support',
    },
    isSql: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_sql' },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'updated_at' },
  },
  {
    sequelize,
    modelName: 'CustomCodingQuestion',
    tableName: 'custom_coding_questions',
    timestamps: false,
  },
);
