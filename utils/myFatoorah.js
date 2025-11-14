// utils/myfatoorah.js
const axios = require('axios');

class MyFatoorahService {
  constructor() {
    this.apiKey = process.env.MYFATOORAH_API_KEY;
    this.baseURL = process.env.MYFATOORAH_BASE_URL;
    this.currency = process.env.MYFATOORAH_CURRENCY || 'KWD';
  }

  // 🔹 Headers للـ API
  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };
  }

  // 🟢 بدء عملية الدفع
  async initiatePayment(orderData) {
    try {
      console.log('🔵 Starting payment initiation for order:', orderData.orderId);
      
      const payload = {
        InvoiceAmount: Number(orderData.total),
        CurrencyIso: this.currency,
        CustomerName: `${orderData.user.firstName} ${orderData.user.lastName}`,
        CustomerEmail: orderData.user.email,
        CustomerMobile: orderData.user.phone || '',
        Language: 'AR',
        DisplayCurrencyIso: this.currency,
        MobileCountryCode: '+965',
        CustomerReference: orderData.orderId,
        CallBackUrl: process.env.MYFATOORAH_SUCCESS_URL,
        ErrorUrl: process.env.MYFATOORAH_ERROR_URL,
        UserDefinedField: JSON.stringify({
          orderId: orderData.orderId,
          userId: orderData.user._id.toString(),
        }),
        InvoiceItems: orderData.cartItems.map(item => ({
          ItemName: item.title || 'Product',
          Quantity: Number(item.quantity) || 1,
          UnitPrice: Number(item.priceAfterOffer || item.price) || 0,
        })),
      };

      console.log('📤 Sending payload to MyFatoorah:', JSON.stringify(payload, null, 2));

      const response = await axios.post(
        `${this.baseURL}/v2/ExecutePayment`,
        payload,
        { headers: this.getHeaders() }
      );

      console.log('📥 MyFatoorah Response:', JSON.stringify(response.data, null, 2));

      if (response.data.IsSuccess) {
        console.log('✅ Payment URL generated successfully');
        return {
          success: true,
          paymentURL: response.data.Data.PaymentURL,
          invoiceId: response.data.Data.InvoiceId,
        };
      }

      console.error('❌ MyFatoorah returned error:', response.data);
      return {
        success: false,
        message: response.data.ValidationErrors?.[0]?.Error || response.data.Message || 'Payment initiation failed',
      };
    } catch (error) {
      console.error('❌ MyFatoorah InitiatePayment Error:');
      console.error('Status:', error.response?.status);
      console.error('Data:', JSON.stringify(error.response?.data, null, 2));
      console.error('Message:', error.message);
      
      return {
        success: false,
        message: error.response?.data?.Message || error.response?.data?.ValidationErrors?.[0]?.Error || 'Payment service error',
      };
    }
  }

  // 🔍 التحقق من حالة الدفع
  async getPaymentStatus(paymentId) {
    try {
      const response = await axios.post(
        `${this.baseURL}/v2/GetPaymentStatus`,
        { Key: paymentId, KeyType: 'PaymentId' },
        { headers: this.getHeaders() }
      );

      if (response.data.IsSuccess) {
        const data = response.data.Data;
        return {
          success: true,
          status: data.InvoiceStatus, // 'Paid', 'Pending', 'Failed', etc.
          amount: data.InvoiceValue,
          reference: data.CustomerReference,
          transactionId: data.InvoiceTransactions?.[0]?.TransactionId,
          paymentMethod: data.InvoiceTransactions?.[0]?.PaymentGateway,
        };
      }

      return { success: false, message: 'Payment status check failed' };
    } catch (error) {
      console.error('❌ MyFatoorah GetPaymentStatus Error:', error.response?.data || error.message);
      return { success: false, message: 'Status check error' };
    }
  }

  // 💰 استرجاع المبلغ (Refund)
  async refundPayment(paymentId, amount, reason) {
    try {
      const response = await axios.post(
        `${this.baseURL}/v2/MakeRefund`,
        {
          KeyType: 'PaymentId',
          Key: paymentId,
          RefundChargeOnCustomer: false,
          ServiceChargeOnCustomer: false,
          Amount: amount,
          Comment: reason || 'Customer requested refund',
        },
        { headers: this.getHeaders() }
      );

      if (response.data.IsSuccess) {
        return {
          success: true,
          refundId: response.data.Data.RefundId,
          amount: response.data.Data.Amount,
        };
      }

      return { success: false, message: 'Refund failed' };
    } catch (error) {
      console.error('❌ MyFatoorah Refund Error:', error.response?.data || error.message);
      return { success: false, message: 'Refund error' };
    }
  }

  // 🔐 التحقق من Webhook Signature (للأمان)
  verifyWebhookSignature(payload, signature) {
    const crypto = require('crypto');
    const hash = crypto
      .createHmac('sha256', this.apiKey)
      .update(JSON.stringify(payload))
      .digest('hex');
    return hash === signature;
  }
}

module.exports = new MyFatoorahService();