# 🔗 Android App Links Setup Guide

## ما هي Android App Links؟

Android App Links هي نوع محسّن من Deep Links تسمح بفتح التطبيق مباشرة بدون سؤال المستخدم.

**الفرق بين Deep Links و App Links:**

| Feature | Deep Links | App Links |
|---------|-----------|-----------|
| Protocol | `3roudapp://` | `https://` |
| User Prompt | نعم (يسأل المستخدم) | لا (يفتح مباشرة) |
| Verification | لا | نعم (عبر assetlinks.json) |
| Fallback | لا يعمل | يفتح الموقع في المتصفح |

---

## 📋 الخطوات المطلوبة:

### 1️⃣ الحصول على SHA-256 Fingerprint

مطور Flutter يحتاج تشغيل هذا الأمر:

```bash
# للـ Debug keystore
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android

# للـ Release keystore
keytool -list -v -keystore /path/to/your/release.keystore -alias your-alias
```

**النتيجة ستكون شيء مثل:**
```
SHA256: AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00
```

**يحتاج إزالة الـ `:` ليصبح:**
```
AABBCCDDEEFF112233445566778899000AABBCCDDEEFF112233445566778899000
```

---

### 2️⃣ تحديث assetlinks.json

افتحي الملف:
```
e:\3roud-App\public\.well-known\assetlinks.json
```

وحدثي `YOUR_SHA256_FINGERPRINT_HERE` بالقيمة الصحيحة.

**مثال:**
```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.3roudapp.mobile",
      "sha256_cert_fingerprints": [
        "AABBCCDDEEFF112233445566778899000AABBCCDDEEFF112233445566778899000"
      ]
    }
  }
]
```

---

### 3️⃣ رفع الملف على السيرفر

```bash
# على السيرفر
cd ~/ecommerce-kwait-app
git pull origin main
pm2 restart all
```

**الملف يجب أن يكون متاح على:**
```
https://3roood.com/.well-known/assetlinks.json
```

---

### 4️⃣ تحديث AndroidManifest.xml (Flutter)

مطور Flutter يحتاج تحديث `AndroidManifest.xml`:

```xml
<activity
    android:name=".MainActivity"
    android:launchMode="singleTop">
    
    <!-- Deep Links (القديم) -->
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="3roudapp" />
    </intent-filter>
    
    <!-- App Links (الجديد) -->
    <intent-filter android:autoVerify="true">
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data
            android:scheme="https"
            android:host="3roood.com"
            android:pathPrefix="/payment-success" />
        <data
            android:scheme="https"
            android:host="3roood.com"
            android:pathPrefix="/payment-error" />
    </intent-filter>
</activity>
```

---

### 5️⃣ تحديث URLs في config.env

**الآن يمكنك استخدام HTTPS URLs مباشرة:**

```env
# بدلاً من HTML redirect pages
MYFATOORAH_SUCCESS_URL=https://3roood.com/payment-success?paymentId={paymentId}&orderId={orderId}
MYFATOORAH_ERROR_URL=https://3roood.com/payment-error?message={message}
```

**لكن انتظري!** هذا يحتاج إنشاء routes جديدة في Express.

---

## 🤔 التوصية:

### الخيار 1: استمري مع Deep Links + HTML Pages (الحالي) ⭐

**المميزات:**
- ✅ يعمل الآن بدون تغييرات
- ✅ بسيط وسهل
- ✅ يعمل على Android و iOS

**العيوب:**
- ⚠️ يسأل المستخدم "فتح في التطبيق؟"

**الإبقاء على:**
```env
MYFATOORAH_SUCCESS_URL=https://3roood.com/payment-success.html
MYFATOORAH_ERROR_URL=https://3roood.com/payment-error.html
```

---

### الخيار 2: استخدام App Links (محسّن)

**المميزات:**
- ✅ يفتح التطبيق مباشرة بدون سؤال
- ✅ أكثر احترافية
- ✅ لو التطبيق مش مثبت، يفتح صفحة ويب

**العيوب:**
- ⚠️ يحتاج تكوين إضافي
- ⚠️ يحتاج routes جديدة في Express
- ⚠️ يعمل فقط على Android (iOS يحتاج Universal Links منفصلة)

---

## 📞 ما الذي يجب فعله؟

**اسألي مطور Flutter:**

1. **هل عنده مشكلة مع Deep Links الحالية؟**
   - لو لا → استمري مع الحل الحالي
   - لو نعم → نكمل App Links

2. **هل حصل على SHA-256 fingerprint؟**
   - يحتاج تشغيل الأمر أعلاه

3. **هل يريد App Links فقط لـ Android أم Universal Links لـ iOS أيضاً؟**

---

## ✅ الخلاصة:

- ✅ ملف `assetlinks.json` جاهز في `public/.well-known/`
- 🔄 يحتاج تحديث `YOUR_SHA256_FINGERPRINT_HERE`
- 🔄 مطور Flutter يحتاج تحديث `AndroidManifest.xml`
- 🔄 اختياري: إنشاء routes جديدة بدلاً من HTML pages

**قوليلي: هل تريدين المتابعة مع App Links أم الإبقاء على Deep Links الحالية؟** 🤔
