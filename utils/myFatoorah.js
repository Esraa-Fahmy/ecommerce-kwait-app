const axios = require('axios');
const crypto = require('crypto');

class MyFatoorahService {
  constructor() {
    this.apiKey = process.env.MYFATOORAH_API_KEY;
    this.baseURL = process.env.MYFATOORAH_BASE_URL;
    this.currency = process.env.MYFATOORAH_CURRENCY || 'KWD';
  }

  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };
  }

  // 🔹 Initiate Payment
  async initiatePayment(orderData) {
    try {
      const payload = {
        InvoiceAmount: Number(orderData.total),
        CurrencyIso: this.currency,
        CustomerName: `${orderData.user.firstName} ${orderData.user.lastName}`,
        CustomerEmail: orderData.user.email,
        CustomerMobile: orderData.user.phone || '',
        Language: 'AR',
        DisplayCurrencyIso: this.currency,
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

      const response = await axios.post(
        `${this.baseURL}/v2/InitiatePayment`,
        payload,
        { headers: this.getHeaders() }
      );

      if (!response.data.IsSuccess) {
        return { success: false, message: response.data.Message || 'Payment initiation failed' };
      }

      const paymentMethods = response.data.Data.PaymentMethods; // جميع طرق الدفع المتاحة

      return {
        success: true,
        invoiceId: response.data.Data.InvoiceId,
        paymentMethods,
      };

    } catch (error) {
      console.error('❌ MyFatoorah InitiatePayment Error:', error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.Message || 'Payment service error',
      };
    }
  }

  // 🔹 Execute Payment with selected method
  async executePayment(invoiceId, paymentMethodId, orderData) {
  try {
    const payload = {
      PaymentMethodId: paymentMethodId,
      InvoiceId: invoiceId,
      CustomerName: `${orderData.user.firstName} ${orderData.user.lastName}`,
      CustomerEmail: orderData.user.email,
      CustomerMobile: orderData.user.phone || '',
      DisplayCurrencyIso: this.currency,
      CallBackUrl: process.env.MYFATOORAH_SUCCESS_URL,
      ErrorUrl: process.env.MYFATOORAH_ERROR_URL,
    };

    const response = await axios.post(
      `${this.baseURL}/v2/ExecutePayment`,
      payload,
      { headers: this.getHeaders() }
    );

    if (!response.data.IsSuccess) {
      return { success: false, message: response.data.Message };
    }

    return {
      success: true,
      paymentURL: response.data.Data.PaymentURL,
      invoiceId: response.data.Data.InvoiceId,
    };

  } catch (err) {
    console.error("ExecutePayment Error:", err.response?.data || err.message);
    return { success: false, message: "Payment service error" };
  }
}


  // 🔹 Get Payment Status
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
          status: data.InvoiceStatus,
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

  // 🔹 Refund Payment
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

  // 🔹 Verify Webhook
  verifyWebhookSignature(payload, signature) {
    const hash = crypto
      .createHmac('sha256', this.apiKey)
      .update(JSON.stringify(payload))
      .digest('hex');
    return hash === signature;
  }
}

module.exports = new MyFatoorahService();
