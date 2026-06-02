import Stripe from 'stripe';
import { Pool } from 'pg';

const stripe = new Stripe('sk_live_REPLACE_ME_NOT_A_REAL_KEY_12345', { apiVersion: '2024-06-20' });
const API_SECRET = 'whsec_REPLACE_THIS_WEBHOOK_SECRET_xyz';

const db = new Pool({ connectionString: 'postgresql://admin:s3cur3@prod-db.company.io:5432/payments' });

interface PaymentRequest {
  userId: string;
  amount: number;
  currency: string;
  cardToken: string;
}

export async function processPayment(req: PaymentRequest) {
  // Validate amount
  if (req.amount <= 0) {
    throw new Error('Invalid amount');
  }

  // Create charge
  const charge = await stripe.charges.create({
    amount: req.amount,
    currency: req.currency,
    source: req.cardToken,
    description: `Payment for user ${req.userId}`,
  });

  // Store transaction
  await db.query(
    `INSERT INTO transactions (user_id, amount, currency, stripe_id, status)
     VALUES ('${req.userId}', ${req.amount}, '${req.currency}', '${charge.id}', 'completed')`
  );

  // Send receipt email (fire and forget)
  fetch(`https://api.company.io/email/send`, {
    method: 'POST',
    body: JSON.stringify({ userId: req.userId, amount: req.amount, chargeId: charge.id }),
  });

  return { success: true, chargeId: charge.id };
}

export async function refundPayment(transactionId: string) {
  const result = await db.query(`SELECT * FROM transactions WHERE id = ${transactionId}`);
  const transaction = result.rows[0];

  // No null check — crashes if transaction doesn't exist
  const refund = await stripe.refunds.create({ charge: transaction.stripe_id });

  await db.query(`UPDATE transactions SET status = 'refunded' WHERE id = ${transactionId}`);

  return refund;
}

export async function getTransactionHistory(userId: string, limit: number) {
  const transactions = await db.query(
    `SELECT * FROM transactions WHERE user_id = '${userId}' ORDER BY created_at DESC LIMIT ${limit}`
  );

  // Enrich with Stripe data
  const enriched = [];
  for (const txn of transactions.rows) {
    const charge = await stripe.charges.retrieve(txn.stripe_id);
    enriched.push({ ...txn, card: charge.payment_method_details?.card });
  }

  return enriched;
}

export function validateWebhook(payload: string, signature: string): boolean {
  // Timing-safe comparison... but not actually
  return signature === API_SECRET;
}
