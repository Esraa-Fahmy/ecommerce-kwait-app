// utils/myFatoorah.js
const axios = require('axios');
const crypto = require('crypto');

const MYFATOORAH_API_KEY = process.env.MYFATOORAH_API_KEY;
const MYFATOORAH_BASE_URL = process.env.MYFATOORAH_BASE_URL || 'https://apitest.myfatoorah.com';
const SUCCESS_URL = process.env.MYFATOORAH_SUCCESS_URL || 'http://localhost:3000/api/v1/payment/success';
const ERROR_URL = process.env.MYFATOORAH_ERROR_URL || 'http://localhost:3000/api/v1/payment/error';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// ✅ Initiate Payment - Get Payment Methods
exports.initiatePayment = async ({ total, user, orderId, cartItems }) => {
  try {
    const response = await axios.post(
      `${MYFATOORAH_BASE_URL}/v2/InitiatePayment`,
      {
        InvoiceAmount: total,
        CurrencyIso: 'KWD',
      },
      {
        headers: {
          Authorization: `Bearer ${MYFATOORAH_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

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
      ItemName: item.name || item.product?.name || 'Product',
      Quantity: item.quantity,
      UnitPrice: item.price,
    }));

    // إضافة الشحن كعنصر منفصل
    if (shippingCost > 0) {
      invoiceItems.push({
        ItemName: 'Shipping Cost',
        Quantity: 1,
        UnitPrice: shippingCost,
      });
    }

    // إضافة الخصم كعنصر سالب
    if (discountValue > 0) {
      invoiceItems.push({
        ItemName: 'Discount',
        Quantity: 1,
        UnitPrice: -discountValue,
      });
    }

    const payload = {
      PaymentMethodId: paymentMethodId,
      InvoiceValue: total,
      CallBackUrl: SUCCESS_URL,
      ErrorUrl: ERROR_URL,
      CustomerName: `${user.firstName} ${user.lastName}`,
      CustomerEmail: user.email,
      CustomerMobile: user.phone,
      CustomerReference: orderId,
      DisplayCurrencyIso: 'KWD',
      MobileCountryCode: '+965',
      Language: 'ar',
      InvoiceItems: invoiceItems,
    };

    const response = await axios.post(
      `${MYFATOORAH_BASE_URL}/v2/ExecutePayment`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${MYFATOORAH_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.IsSuccess) {
      return {
        success: true,
        paymentURL: response.data.Data.PaymentURL,
        invoiceId: response.data.Data.InvoiceId,
      };
    } else {
      return {
        success: false,
        message: response.data.Message || 'Failed to execute payment',
      };
    }
  } catch (error) {
    console.error('❌ MyFatoorah Execute Payment Error:', error.response?.data || error.message);
    return {
      success: false,
      message: error.response?.data?.Message || 'Payment execution failed',
    };
  }
};

// ✅ Get Payment Status
exports.getPaymentStatus = async (keyValue, keyType = 'PaymentId') => {
  try {
    const response = await axios.post(
      `${MYFATOORAH_BASE_URL}/v2/GetPaymentStatus`,
      {
        Key: keyValue,
        KeyType: keyType, // 'PaymentId' or 'InvoiceId'
      },
      {
        headers: {
          Authorization: `Bearer ${MYFATOORAH_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.IsSuccess) {
      const data = response.data.Data;
      return {
        success: true,
        status: data.InvoiceStatus, // 'Paid', 'Pending', 'Failed', etc.
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
    const response = await axios.post(
      `${MYFATOORAH_BASE_URL}/v2/MakeRefund`,
      {
        KeyType: 'TransactionId',
        Key: transactionId,
        RefundChargeOnCustomer: false,
        ServiceChargeOnCustomer: false,
        Amount: amount,
        Comment: reason || 'Refund requested by admin',
      },
      {
        headers: {
          Authorization: `Bearer ${MYFATOORAH_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

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
  if (!signature || !WEBHOOK_SECRET) return false;

  const hash = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');

  return hash === signature;
};
