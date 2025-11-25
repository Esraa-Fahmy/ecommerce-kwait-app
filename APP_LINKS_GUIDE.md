# 🔗 App Links Configuration Guide

## ما تم تنفيذه:

### ✅ Backend Changes:

1. **تحديث `paymentController.js`:**
   - `paymentSuccess` الآن يعرض صفحة HTML بسيطة بدلاً من redirect لـ deep link
   - `paymentError` الآن يعرض صفحة HTML بسيطة للأخطاء
   - Android سيعترض هذه URLs تلقائياً ويفتح التطبيق

2. **ملف `assetlinks.json` جاهز:**
   - موجود في `public/.well-known/assetlinks.json`
   - محدّث بالـ SHA-256 fingerprint الصحيح
   - Package name: `com.example.aoroud`

---

## 📋 خطوات النشر:

### 1️⃣ تحديث config.env على السيرفر:

```env
# URLs الجديدة (بدون .html)
MYFATOORAH_SUCCESS_URL=https://3roood.com/api/v1/payment/success
MYFATOORAH_ERROR_URL=https://3roood.com/api/v1/payment/error
```

> **ملاحظة:** نفس URLs القديمة! لكن الآن بتعرض صفحات بسيطة بدلاً من redirect

### 2️⃣ رفع التحديثات:

```bash
cd ~/ecommerce-kwait-app
git pull origin main
pm2 restart all
```

### 3️⃣ التحقق من assetlinks.json:

```bash
curl https://3roood.com/.well-known/assetlinks.json
```

يجب أن يعرض محتوى الملف بشكل صحيح.

---

## 📱 Flutter Configuration:

### 1️⃣ تحديث `AndroidManifest.xml`:

```xml
<activity
    android:name=".MainActivity"
    android:launchMode="singleTop">
    
    <!-- App Links للدفع -->
    <intent-filter android:autoVerify="true">
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        
        <!-- Success URL -->
        <data
            android:scheme="https"
            android:host="3roood.com"
            android:pathPrefix="/api/v1/payment/success" />
        
        <!-- Error URL -->
        <data
            android:scheme="https"
            android:host="3roood.com"
            android:pathPrefix="/api/v1/payment/error" />
    </intent-filter>
</activity>
```

### 2️⃣ كود Flutter لاستقبال App Links:

```dart
import 'package:uni_links/uni_links.dart';
import 'dart:async';

class PaymentService {
  StreamSubscription? _sub;

  void initAppLinks() {
    // للـ App وهو مفتوح
    _sub = linkStream.listen((String? link) {
      if (link != null) {
        _handleAppLink(link);
      }
    }, onError: (err) {
      print('Error: $err');
    });

    // للـ App وهو مغلق
    _getInitialLink();
  }

  Future<void> _getInitialLink() async {
    try {
      final initialLink = await getInitialLink();
      if (initialLink != null) {
        _handleAppLink(initialLink);
      }
    } catch (e) {
      print('Error getting initial link: $e');
    }
  }

  void _handleAppLink(String link) {
    final uri = Uri.parse(link);
    
    if (uri.path.contains('/payment/success')) {
      final paymentId = uri.queryParameters['paymentId'];
      final orderId = uri.queryParameters['orderId'];
      
      // عرض رسالة نجاح
      _showSuccessDialog(orderId);
      
      // الانتقال لصفحة تفاصيل الطلب
      Navigator.pushNamed(context, '/order-details', arguments: orderId);
    } 
    else if (uri.path.contains('/payment/error')) {
      final message = uri.queryParameters['message'] ?? 'Payment failed';
      
      // عرض رسالة خطأ
      _showErrorDialog(message);
    }
  }

  void dispose() {
    _sub?.cancel();
  }
}
```

### 3️⃣ إضافة package في `pubspec.yaml`:

```yaml
dependencies:
  uni_links: ^0.5.1
```

---

## 🧪 الاختبار:

### 1️⃣ اختبار assetlinks.json:

```
https://3roood.com/.well-known/assetlinks.json
```

يجب أن يعرض JSON صحيح.

### 2️⃣ اختبار URLs مباشرة:

```
https://3roood.com/api/v1/payment/success?paymentId=test123
https://3roood.com/api/v1/payment/error?message=test
```

يجب أن تعرض صفحات HTML بسيطة.

### 3️⃣ اختبار من Flutter:

1. اعملي طلب جديد
2. ادفعي بالفيزا
3. **التطبيق يجب أن يفتح تلقائياً بدون سؤال!** 🎉

---

## 🔍 كيف يعمل النظام:

```
1. المستخدم يدفع على MyFatoorah ✅
         ↓
2. MyFatoorah يعيد التوجيه إلى:
   https://3roood.com/api/v1/payment/success?paymentId=xxx
         ↓
3. Android يعترض الـ URL (بفضل App Links)
         ↓
4. التطبيق يفتح مباشرة بدون سؤال! 📱
         ↓
5. Flutter يستقبل الـ URL ويعالجها
         ↓
6. عرض صفحة تفاصيل الطلب 🎉
```

---

## ✅ المميزات:

- ✅ يفتح التطبيق مباشرة بدون سؤال المستخدم
- ✅ لو التطبيق مش مثبت، يعرض صفحة HTML في المتصفح
- ✅ أكثر أماناً (verified بواسطة assetlinks.json)
- ✅ تجربة مستخدم أفضل

---

## 📞 ملاحظات مهمة:

1. **assetlinks.json يجب أن يكون متاح على HTTPS**
2. **SHA-256 fingerprint يجب أن يكون صحيح**
3. **Package name يجب أن يطابق التطبيق**
4. **android:autoVerify="true" مهم جداً في AndroidManifest.xml**

---

## 🔧 استكشاف الأخطاء:

### المشكلة: التطبيق لا يفتح تلقائياً

**الحل:**
1. تأكد من `assetlinks.json` متاح على الرابط الصحيح
2. تأكد من SHA-256 fingerprint صحيح
3. تأكد من `android:autoVerify="true"` موجود
4. امسح data التطبيق وأعد التثبيت

### المشكلة: Cannot GET /.well-known/assetlinks.json

**الحل:**
```bash
cd ~/ecommerce-kwait-app
git pull origin main
pm2 restart all
```

---

## 🎯 الخلاصة:

- ✅ Backend جاهز ومحدّث
- ✅ assetlinks.json جاهز
- 🔄 مطور Flutter يحتاج تحديث AndroidManifest.xml
- 🔄 مطور Flutter يحتاج إضافة كود استقبال App Links
