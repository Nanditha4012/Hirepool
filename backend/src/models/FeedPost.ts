import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * 'walkin' and 'job' are the two tabs of the Walk-in Pedia / Job Book screen;
 * 'community' is a post inside a community the author has joined.
 */
export type FeedPostKind = 'walkin' | 'job' | 'community';

export interface FeedPostAttributes {
  id: string;
  kind: FeedPostKind;
  authorId: string;
  /**
   * Who to show as the author, as they were at publish time.
   *
   * Not resolved through a join: RLS on `users` lets a signed-in user read
   * only their own row, so joining it from a public feed yields a name for
   * one post per page and null for every other. See the column comment in
   * 20240113000001-social-module.js.
   */
  authorName: string;
  authorRole: string;
  communityId: string | null;
  postedOnBehalf: boolean;
  title: string;
  body: string | null;
  companyName: string | null;
  roleTitle: string | null;
  location: string | null;
  qualification: string | null;
  experience: string | null;
  salary: string | null;
  /**
   * `YYYY-MM-DD`, not a Date. Sequelize hands DATEONLY back as a string and
   * that is exactly the shape the today/upcoming/over grouping compares
   * against — converting it to a Date here would reintroduce the timezone
   * question the DATEONLY column exists to avoid.
   */
  walkinDate: string | null;
  walkinStartTime: string | null;
  walkinEndTime: string | null;
  venue: string | null;
  applyLink: string | null;
  contactPerson: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  whatsappLink: string | null;
  imageLink: string | null;
  isRemoved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type FeedPostCreationAttributes = Optional<
  FeedPostAttributes,
  | 'id'
  | 'communityId'
  | 'postedOnBehalf'
  | 'body'
  | 'companyName'
  | 'roleTitle'
  | 'location'
  | 'qualification'
  | 'experience'
  | 'salary'
  | 'walkinDate'
  | 'walkinStartTime'
  | 'walkinEndTime'
  | 'venue'
  | 'applyLink'
  | 'contactPerson'
  | 'contactEmail'
  | 'contactPhone'
  | 'whatsappLink'
  | 'imageLink'
  | 'isRemoved'
  | 'createdAt'
  | 'updatedAt'
>;

export class FeedPost
  extends Model<FeedPostAttributes, FeedPostCreationAttributes>
  implements FeedPostAttributes
{
  declare id: string;
  declare kind: FeedPostKind;
  declare authorId: string;
  declare authorName: string;
  declare authorRole: string;
  declare communityId: string | null;
  declare postedOnBehalf: boolean;
  declare title: string;
  declare body: string | null;
  declare companyName: string | null;
  declare roleTitle: string | null;
  declare location: string | null;
  declare qualification: string | null;
  declare experience: string | null;
  declare salary: string | null;
  declare walkinDate: string | null;
  declare walkinStartTime: string | null;
  declare walkinEndTime: string | null;
  declare venue: string | null;
  declare applyLink: string | null;
  declare contactPerson: string | null;
  declare contactEmail: string | null;
  declare contactPhone: string | null;
  declare whatsappLink: string | null;
  declare imageLink: string | null;
  declare isRemoved: boolean;
  declare readonly createdAt: Date;
  declare updatedAt: Date;
}

FeedPost.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    kind: { type: DataTypes.ENUM('walkin', 'job', 'community'), allowNull: false },
    authorId: { type: DataTypes.UUID, allowNull: false, field: 'author_id' },
    authorName: { type: DataTypes.STRING, allowNull: false, field: 'author_name' },
    authorRole: { type: DataTypes.STRING, allowNull: false, field: 'author_role' },
    communityId: { type: DataTypes.UUID, allowNull: true, field: 'community_id' },
    postedOnBehalf: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'posted_on_behalf',
    },
    title: { type: DataTypes.STRING, allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: true },
    companyName: { type: DataTypes.STRING, allowNull: true, field: 'company_name' },
    roleTitle: { type: DataTypes.STRING, allowNull: true, field: 'role_title' },
    location: { type: DataTypes.STRING, allowNull: true },
    qualification: { type: DataTypes.STRING, allowNull: true },
    experience: { type: DataTypes.STRING, allowNull: true },
    salary: { type: DataTypes.STRING, allowNull: true },
    walkinDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'walkin_date' },
    walkinStartTime: { type: DataTypes.STRING, allowNull: true, field: 'walkin_start_time' },
    walkinEndTime: { type: DataTypes.STRING, allowNull: true, field: 'walkin_end_time' },
    venue: { type: DataTypes.TEXT, allowNull: true },
    applyLink: { type: DataTypes.STRING, allowNull: true, field: 'apply_link' },
    contactPerson: { type: DataTypes.STRING, allowNull: true, field: 'contact_person' },
    contactEmail: { type: DataTypes.STRING, allowNull: true, field: 'contact_email' },
    contactPhone: { type: DataTypes.STRING, allowNull: true, field: 'contact_phone' },
    whatsappLink: { type: DataTypes.STRING, allowNull: true, field: 'whatsapp_link' },
    imageLink: { type: DataTypes.STRING, allowNull: true, field: 'image_link' },
    isRemoved: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_removed' },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'updated_at' },
  },
  {
    sequelize,
    modelName: 'FeedPost',
    tableName: 'feed_posts',
    timestamps: false,
  },
);
