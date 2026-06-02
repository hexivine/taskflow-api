import unittest
from unittest.mock import patch, MagicMock
from services.payment import processPayment, refundPayment, getTransactionHistory, validateWebhook

class TestPaymentService(unittest.IsolatedAsyncioTestCase):

    @patch('services.payment.stripe')
    @patch('services.payment.db')
    async def test_process_payment_happy_path(self, mock_db, mock_stripe):
        mock_stripe.charges.create.return_value = {'id': 'ch_123'}
        mock_db.query.return_value = None

        req = {
            'userId': 'user123',
            'amount': 100,
            'currency': 'usd',
            'cardToken': 'tok_123'
        }

        result = await processPayment(req)
        self.assertTrue(result['success'])
        self.assertEqual(result['chargeId'], 'ch_123')

    @patch('services.payment.stripe')
    @patch('services.payment.db')
    async def test_process_payment_invalid_amount(self, mock_db, mock_stripe):
        req = {
            'userId': 'user123',
            'amount': 0,
            'currency': 'usd',
            'cardToken': 'tok_123'
        }

        with self.assertRaises(ValueError):
            await processPayment(req)

    @patch('services.payment.stripe')
    @patch('services.payment.db')
    async def test_refund_payment_happy_path(self, mock_db, mock_stripe):
        mock_db.query.side_effect = [
            MagicMock(rows=[{'stripe_id': 'ch_123'}]),
            None
        ]
        mock_stripe.refunds.create.return_value = {'id': 're_123'}

        result = await refundPayment('txn_123')
        self.assertEqual(result['id'], 're_123')

    @patch('services.payment.stripe')
    @patch('services.payment.db')
    async def test_refund_payment_transaction_not_found(self, mock_db, mock_stripe):
        mock_db.query.return_value = MagicMock(rows=[])

        with self.assertRaises(IndexError):
            await refundPayment('txn_123')

    @patch('services.payment.stripe')
    @patch('services.payment.db')
    async def test_get_transaction_history_happy_path(self, mock_db, mock_stripe):
        mock_db.query.return_value = MagicMock(rows=[
            {'stripe_id': 'ch_123', 'user_id': 'user123'}
        ])
        mock_stripe.charges.retrieve.return_value = {'payment_method_details': {'card': 'card_123'}}

        result = await getTransactionHistory('user123', 10)
        self.assertEqual(len(result), 1)

    def test_validate_webhook_happy_path(self):
        self.assertTrue(validateWebhook('payload', 'whsec_REPLACE_THIS_WEBHOOK_SECRET_xyz'))

    def test_validate_webhook_invalid_signature(self):
        self.assertFalse(validateWebhook('payload', 'wrong_signature'))

if __name__ == '__main__':
    unittest.main()