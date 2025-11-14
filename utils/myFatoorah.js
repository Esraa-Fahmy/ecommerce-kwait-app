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

  // 🔹 Initiate Payment (Get available methods)
  async initiatePayment(orderData) {
    try {
      const payload = {
        InvoiceAmount: Number(orderData.total),
        CurrencyIso: this.currency
      };

      const response = await axios.post(
        `${this.baseURL}/v2/InitiatePayment`,
        payload,
        { headers: this.getHeaders() }
      );

      if (!response.data.IsSuccess) {
        return {
          success: false,
          message: response.data.Message || "Initiate payment failed"
        };
      }

      return {
        success: true,
        paymentMethods: response.data.Data.PaymentMethods
      };

    } catch (error) {
      console.error("❌ InitiatePayment ERROR:", error.response?.data || error.message);
      return {
        success: false,
        message: error.response?.data?.Message || "Payment service error"
      };
    }
  }

  // 🔹 Execute Payment with selected method
  async executePayment(paymentMethodId, orderData) {
    try {
      console.log('🔵 Executing payment with MyFatoorah...');
      console.log('PaymentMethodId:', paymentMethodId);
      console.log('Order Total:', orderData.total);
      
      // تنظيف رقم الموبايل - إزالة +965 وأي مسافات
      let cleanMobile = (orderData.user.phone || '').replace(/\D/g, '');
      
      if (cleanMobile.startsWith('965')) {
        cleanMobile = cleanMobile.substring(3);
      }
      
      if (cleanMobile.length > 11) {
        cleanMobile = cleanMobile.substring(0, 11);
      }
      
      console.log('📱 Cleaned mobile:', cleanMobile);
      
      const payload = {
        PaymentMethodId: Number(paymentMethodId),
        InvoiceValue: Number(orderData.total),
        CustomerName: `${orderData.user.firstName} ${orderData.user.lastName}`,
        CustomerEmail: orderData.user.email,
        CustomerMobile: cleanMobile,
        DisplayCurrencyIso: this.currency,
        CallBackUrl: process.env.MYFATOORAH_SUCCESS_URL,
        ErrorUrl: process.env.MYFATOORAH_ERROR_URL,
        CustomerReference: orderData.orderId,
        Language: 'AR',
        MobileCountryCode: '+965',
      };

      console.log('📤 Payload:', JSON.stringify(payload, null, 2));

      const response = await axios.post(
        `${this.baseURL}/v2/ExecutePayment`,
        payload,
        { headers: this.getHeaders() }
      );

      console.log('📥 MyFatoorah Response:', JSON.stringify(response.data, null, 2));

      if (!response.data.IsSuccess) {
        console.error('❌ ExecutePayment FAILED:', response.data);
        return { 
          success: false, 
          message: response.data.ValidationErrors?.[0]?.Error || response.data.Message || 'Payment execution failed'
        };
      }

      console.log('✅ Payment URL generated successfully');
      return {
        success: true,
        paymentURL: response.data.Data.PaymentURL,
        invoiceId: response.data.Data.InvoiceId,
      };

    } catch (error) {
      console.error('❌ ExecutePayment ERROR:');
      console.error('Status:', error.response?.status);
      console.error('Data:', JSON.stringify(error.response?.data, null, 2));
      console.error('Message:', error.message);
      
      return { 
        success: false, 
        message: error.response?.data?.ValidationErrors?.[0]?.Error || 
                 error.response?.data?.Message || 
                 'Payment service error' 
      };
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