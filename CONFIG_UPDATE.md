# ⚠️ IMPORTANT: Update config.env

## URLs الصحيحة للـ App Links:

```env
# MyFatoorah Configuration
MYFATOORAH_API_KEY=SK_KWT_A3HwmPNauz8XmXVjC8T8cgzIvflx3dzyXwLD8mxCYhooxpShgOrpGCZsuZgE7n6Z

MYFATOORAH_BASE_URL=https://apitest.myfatoorah.com
MYFATOORAH_CURRENCY=KWD

# ✅ App Links URLs (محدّثة)
MYFATOORAH_SUCCESS_URL=https://3roood.com/payment-success
MYFATOORAH_ERROR_URL=https://3roood.com/payment-failed

MYFATOORAH_CALLBACK_URL=https://3roood.com/api/v1/payment/webhook
WEBHOOK_SECRET=DmWOOPJDa/u+ttvcxAKii3QSV1fo9g0j+kQLONRiC4X2kH6FccLxU4avZJmlyuvn7idw9TUJEQUejjG5O0nteQ==
```

## التغييرات:

### ❌ القديم (غلط):
```env
MYFATOORAH_SUCCESS_URL=https://3roood.com/payment-success.html
MYFATOORAH_ERROR_URL=https://3roood.com/payment-error.html
```

### ✅ الجديد (صح):
```env
MYFATOORAH_SUCCESS_URL=https://3roood.com/payment-success
MYFATOORAH_ERROR_URL=https://3roood.com/payment-failed
```

---

## 📋 خطوات التحديث:

### على السيرفر:

```bash
# 1. تحديث config.env
nano ~/ecommerce-kwait-app/config.env

# غيري السطرين:
MYFATOORAH_SUCCESS_URL=https://3roood.com/payment-success
MYFATOORAH_ERROR_URL=https://3roood.com/payment-failed

# 2. سحب آخر تحديثات
git pull origin main

# 3. إعادة التشغيل
pm2 restart all
```

---

## ✅ التطابق مع Flutter:

### Flutter AndroidManifest.xml:
```xml
<data android:scheme="https" android:host="3roood.com" android:pathPrefix="/payment-success" />
<data android:scheme="https" android:host="3roood.com" android:pathPrefix="/payment-failed" />
```

### Backend Routes (الجديدة):
```javascript
app.get('/payment-success', paymentSuccess);
app.get('/payment-failed', paymentError);
```

### MyFatoorah URLs:
```env
MYFATOORAH_SUCCESS_URL=https://3roood.com/payment-success
MYFATOORAH_ERROR_URL=https://3roood.com/payment-failed
```

**الآن كل حاجة متطابقة!** ✅

---

## 🧪 الاختبار:

```
https://3roood.com/payment-success?paymentId=test123
https://3roood.com/payment-failed?error=test
```

يجب أن تعرض صفحات HTML بسيطة، وAndroid سيعترضها ويفتح التطبيق!
