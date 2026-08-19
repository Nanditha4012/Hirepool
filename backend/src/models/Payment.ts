import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export type PaymentType = 'subscription' | 'pay_per_unlock' | 'boost' | 'relevancy_package';
export type PaymentStatus = 'created' | 'paid' | 'failed' | 'refunded';

/**
 * Shape of `metadata`, keyed by `type` — see the header comment in
 * migrations/20240107000001-phase6-payments-notifications.js. Holds
 * whatever the Razorpay webhook needs to apply the purchase's effect on
 * success.
 *
 * `relevancy_package` (Feature 1, Phase 3): the relevancy_packages row is
 * created unpurchased at checkout time (see paymentController.
 * purchaseRelevancyPackage), so this only needs to carry its id — the
 * webhook looks the row up and fills in purchasedByCompanyId/purchasedAt on
 * success, same "metadata carries a foreign key" shape as `planId` above.
 */
export type PaymentMetadata =
  | { planId: string }
  | { unlockQuantity: number }
  | { boostDays: number }
  | { relevancyPackageId: string };

export interface PaymentAttributes {
  id: string;
  type: PaymentType;
  payerUserId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
  razorpaySignature: string | null;
  metadata: PaymentMetadata | Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

type PaymentCreationAttributes = Optional<
  PaymentAttributes,
  | 'id'
  | 'currency'
  | 'status'
  | 'razorpayPaymentId'
  | 'razorpaySignature'
  | 'metadata'
  | 'createdAt'
  | 'updatedAt'
>;

export class Payment
  extends Model<PaymentAttributes, PaymentCreationAttributes>
  implements PaymentAttributes
{
  declare id: string;
  declare type: PaymentType;
  declare payerUserId: string;
  declare amount: number;
  declare currency: string;
  declare status: PaymentStatus;
  declare razorpayOrderId: string;
  declare razorpayPaymentId: string | null;
  declare razorpaySignature: string | null;
  declare metadata: PaymentMetadata | Record<string, unknown>;
  declare readonly createdAt: Date;
  // Not readonly, unlike most other models' updatedAt — the Razorpay
  // webhook handler (paymentController.razorpayWebhook) sets this
  // explicitly when transitioning a payment to paid/failed, since
  // `timestamps: false` means Sequelize never auto-manages it.
  declare updatedAt: Date;
}

Payment.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    type: {
      type: DataTypes.ENUM('subscription', 'pay_per_unlock', 'boost', 'relevancy_package'),
      allowNull: false,
    },
    payerUserId: { type: DataTypes.UUID, allowNull: false, field: 'payer_user_id' },
    amount: { type: DataTypes.DECIMAL, allowNull: false },
    currency: { type: DataTypes.STRING, allowNull: false, defaultValue: 'INR' },
    status: {
      type: DataTypes.ENUM('created', 'paid', 'failed', 'refunded'),
      allowNull: false,
      defaultValue: 'created',
    },
    razorpayOrderId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      field: 'razorpay_order_id',
    },
    razorpayPaymentId: { type: DataTypes.STRING, allowNull: true, field: 'razorpay_payment_id' },
    razorpaySignature: { type: DataTypes.STRING, allowNull: true, field: 'razorpay_signature' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'updated_at' },
  },
  {
    sequelize,
    modelName: 'Payment',
    tableName: 'payments',
    timestamps: false,
  },
);
