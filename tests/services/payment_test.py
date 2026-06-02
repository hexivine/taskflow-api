import unittest
from unittest.mock import patch, MagicMock
import json
from src.services.payment import processPayment, refundPayment, getTransactionHistory, validateWebhook

class TestPaymentService(unittest.IsolatedAsyncioTestCase):

    @patch('src.services.payment.stripe')
    @patch('src.services.payment.db')
    async def test_process_payment_happy_path(self, mock_db, mock_stripe):
        mock_stripe.charges.create.return_value = {'id': 'ch_123', 'status': 'succeeded'}
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

    @patch('src.services.payment.stripe')
    @patch('src.services.payment.db')
    async def test_process_payment_invalid_amount(self, mock_db, mock_stripe):
        req = {
            'userId': 'user123',
            'amount': -10,
            'currency': 'usd',
            'cardToken': 'tok_123'
        }

        with self.assertRaises(Error):
            await processPayment(req)

    @patch('src.services.payment.stripe')
    @patch('src.services.payment.db')
    async def test_refund_payment_happy_path(self, mock_db, mock_stripe):
        mock_db.query.side_effect = [
            MagicMock(rows=[{'id': 'txn_123', 'stripe_id': 'ch_123'}]),
            None
        ]
        mock_stripe.refunds.create.return_value = {'id': 're_123'}

        refund = await refundPayment('txn_123')
        self.assertEqual(refund['id'], 're_123')

    @patch('src.services.payment.stripe')
    @patch('src.services.payment.db')
    async def test_get_transaction_history_happy_path(self, mock_db, mock_stripe):
        mock_db.query.return_value = MagicMock(rows=[{'id': 'txn_123', 'stripe_id': 'ch_123'}])
        mock_stripe.charges.retrieve.return_value = {'payment_method_details': {'card': {'brand': 'visa'}}}

        transactions = await getTransactionHistory('user123', 10)
        self.assertEqual(len(transactions), 1)
        self.assertEqual(transactions[0]['card']['brand'], 'visa')

    def test_validate_webhook_happy_path(self):
        self.assertTrue(validateWebhook('payload', 'whsec_REPLACE_THIS_WEBHOOK_SECRET_xyz'))

    def test_validate_webhook_invalid_signature(self):
        self.assertFalse(validateWebhook('payload', 'wrong_signature'))

if __name__ == '__main__':
    unittest.main()