const axios = require('axios');
const crypto = require('crypto');

const MYFATOORAH_API_KEY = process.env.MYFATOORAH_API_KEY;
const MYFATOORAH_BASE_URL = process.env.MYFATOORAH_BASE_URL || 'https://apitest.myfatoorah.com';
const SUCCESS_URL = process.env.MYFATOORAH_SUCCESS_URL || 'https://3roood.com/api/v1/payment-success';
const ERROR_URL = process.env.MYFATOORAH_ERROR_URL || 'https://3roood.com/api/v1/payment-failed';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// ✅ Axios instance with default config
const myfatoorahClient = axios.create({
  baseURL: MYFATOORAH_BASE_URL,
  timeout: 30000, // 30 seconds
  headers: {
    'Authorization': `Bearer ${MYFATOORAH_API_KEY}`,
    'Content-Type': 'application/json',
  }
});

// ✅ Request interceptor for logging
myfatoorahClient.interceptors.request.use(
  (config) => {
    console.log(`📤 MyFatoorah Request: ${config.method.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('❌ Request Error:', error);
    return Promise.reject(error);
  }
);

// ✅ Response interceptor for logging
myfatoorahClient.interceptors.response.use(
  (response) => {
    console.log(`📥 MyFatoorah Response: ${response.config.url} - Success`);
    return response;
  },
  (error) => {
    console.error(`❌ MyFatoorah Error: ${error.config?.url}`, 
      error.response?.data || error.message
    );
    return Promise.reject(error);
  }
);

// ✅ Initiate Payment - Get Payment Methods
exports.initiatePayment = async ({ total, user, orderId, cartItems }) => {
  try {
    const response = await myfatoorahClient.post('/v2/InitiatePayment', {
      InvoiceAmount: total,
      CurrencyIso: 'KWD',
    });

    if (response.data.IsSuccess) {
      return {
        success: true,
        paymentMethods: response.data.Data.PaymentMethods,
      };
    } else {
      return {
        success: false,
        message: response.data.Message || 'Failed to initiate payment',
      };
    }
  } catch (error) {
    console.error('❌ MyFatoorah Initiate Payment Error:', error.response?.data || error.message);
    return {
      success: false,
      message: error.response?.data?.Message || 'Payment initiation failed',
    };
  }
};

// ✅ Execute Payment - Create Payment Link
exports.executePayment = async (paymentMethodId, { orderId, total, shippingCost, discountValue, user, cartItems }) => {
  try {
    const invoiceItems = cartItems.map(item => ({
      ItemName: item.title || item.name || item.product?.title || item.product?.name || 'Product',
      Quantity: item.quantity,
      UnitPrice: item.priceAfterOffer || item.price,
    }));

    // Add shipping
    if (shippingCost > 0) {
      invoiceItems.push({
        ItemName: 'Shipping Cost',
        Quantity: 1,
        UnitPrice: shippingCost,
      });
    }

    // Add discount
    if (discountValue > 0) {
      invoiceItems.push({
        ItemName: 'Discount',
        Quantity: 1,
        UnitPrice: -discountValue,
      });
    }

    // ✅ Format phone number (remove country code)
    let formattedPhone = user.phone.replace(/\D/g, '');
    if (formattedPhone.startsWith('965')) {
      formattedPhone = formattedPhone.substring(3);
    }
    formattedPhone = formattedPhone.substring(0, 11);

    const payload = {
      PaymentMethodId: paymentMethodId,
      InvoiceValue: total,
      CallBackUrl: SUCCESS_URL,
      ErrorUrl: ERROR_URL,
      CustomerName: `${user.firstName} ${user.lastName}`,
      CustomerEmail: user.email,
      CustomerMobile: formattedPhone,
      CustomerReference: orderId,
      DisplayCurrencyIso: 'KWD',
      MobileCountryCode: '+965',
      Language: 'ar',
      InvoiceItems: invoiceItems,
    };

    console.log('🔍 Sending to MyFatoorah:', JSON.stringify(payload, null, 2));

    const response = await myfatoorahClient.post('/v2/ExecutePayment', payload);

    if (response.data.IsSuccess) {
      return {
        success: true,
        paymentURL: response.data.Data.PaymentURL,
        invoiceId: response.data.Data.InvoiceId,
      };
    } else {
      console.error('❌ MyFatoorah rejected:', JSON.stringify(response.data, null, 2));
      return {
        success: false,
        message: response.data.Message || 'Failed to execute payment',
      };
    }
  } catch (error) {
    console.error('❌ MyFatoorah API Error:', JSON.stringify(error.response?.data, null, 2));
    const errorMsg = error.response?.data?.ValidationErrors?.[0]?.Error 
      || error.response?.data?.Message 
      || 'Payment execution failed';
    return {
      success: false,
      message: errorMsg,
    };
  }
};

// ✅ Get Payment Status
exports.getPaymentStatus = async (keyValue, keyType = 'PaymentId') => {
  try {
    const response = await myfatoorahClient.post('/v2/GetPaymentStatus', {
      Key: keyValue,
      KeyType: keyType,
    });

    if (response.data.IsSuccess) {
      const data = response.data.Data;
      return {
        success: true,
        status: data.InvoiceStatus,
        transactionId: data.InvoiceTransactions?.[0]?.TransactionId,
        paymentMethod: data.InvoiceTransactions?.[0]?.PaymentGateway,
        reference: data.CustomerReference,
        invoiceId: data.InvoiceId,
      };
    } else {
      return {
        success: false,
        message: response.data.Message || 'Failed to get payment status',
      };
    }
  } catch (error) {
    console.error('❌ MyFatoorah Get Payment Status Error:', error.response?.data || error.message);
    return {
      success: false,
      message: error.response?.data?.Message || 'Failed to retrieve payment status',
    };
  }
};

// ✅ Refund Payment
exports.refundPayment = async (transactionId, amount, reason) => {
  try {
    const response = await myfatoorahClient.post('/v2/MakeRefund', {
      KeyType: 'TransactionId',
      Key: transactionId,
      RefundChargeOnCustomer: false,
      ServiceChargeOnCustomer: false,
      Amount: amount,
      Comment: reason || 'Refund requested by admin',
    });

    if (response.data.IsSuccess) {
      return {
        success: true,
        refundId: response.data.Data.RefundId,
        message: 'Refund processed successfully',
      };
    } else {
      return {
        success: false,
        message: response.data.Message || 'Refund failed',
      };
    }
  } catch (error) {
    console.error('❌ MyFatoorah Refund Error:', error.response?.data || error.message);
    return {
      success: false,
      message: error.response?.data?.Message || 'Refund processing failed',
    };
  }
};

// ✅ Verify Webhook Signature
exports.verifyWebhookSignature = (payload, signature) => {
  if (!signature || !WEBHOOK_SECRET) {
    console.warn('⚠️ Missing signature or webhook secret');
    return false;
  }

  try {
    const hash = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(JSON.stringify(payload))
      .digest('hex');

    const isValid = hash === signature;
    console.log(`🔐 Webhook signature ${isValid ? 'valid ✅' : 'invalid ❌'}`);
    return isValid;
  } catch (error) {
    console.error('❌ Signature verification error:', error);
    return false;
  }
};