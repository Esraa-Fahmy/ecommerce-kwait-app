# 🚨 حل عاجل - تحديث config.env على السيرفر

## المشكلة:
الـ URL اللي ظهر كان:
```
https://3roood.com/3roudapp://payment-success?paymentId=xxx
```

هذا معناه أن الـ backend لسه بيستخدم deep links مباشرة بدل HTML pages!

---

## ✅ الحل (خطوتين فقط):

### 1️⃣ تحديث config.env على السيرفر

```bash
# اتصلي بالسيرفر عبر SSH
ssh root@vmi2829991

# افتحي ملف config.env
cd ~/ecommerce-kwait-app
nano config.env
```

**غيري السطرين دول:**

```env
# ❌ احذفي أو غيري القديم:
MYFATOORAH_SUCCESS_URL=https://3roood.com/api/v1/payment/success
MYFATOORAH_ERROR_URL=https://3roood.com/api/v1/payment/error

# ✅ حطي الجديد:
MYFATOORAH_SUCCESS_URL=https://3roood.com/payment-success.html
MYFATOORAH_ERROR_URL=https://3roood.com/payment-error.html
```

**احفظي الملف:**
- اضغطي `Ctrl + O` (احفظ)
- اضغطي `Enter` (تأكيد)
- اضغطي `Ctrl + X` (خروج)

---

### 2️⃣ إعادة تشغيل Backend

```bash
# أعيدي تشغيل التطبيق
pm2 restart all

# تأكدي أنه شغال
pm2 logs --lines 20
```

**يجب أن تشوفي:**
```
Server running on port 8080
```

---

### 3️⃣ تحقق من القيم (اختياري)

للتأكد أن الـ environment variables اتحدثت:

```bash
# افتحي Node.js console
node

# اطبعي القيم
process.env.MYFATOORAH_SUCCESS_URL
process.env.MYFATOORAH_ERROR_URL

# اخرجي
.exit
```

---

## 🧪 اختبار:

بعد إعادة التشغيل، جربي دفع جديد من Flutter.

**المفروض يظهر:**
```
https://3roood.com/payment-success.html?paymentId=xxx&orderId=yyy
```

**مش:**
```
https://3roood.com/3roudapp://payment-success?paymentId=xxx
```

---

## ⚠️ ملاحظة مهمة:

لو عملتي `git pull` قبل كده، ممكن الملف `config.env` **ما اتحدثش** لأنه في `.gitignore`.

عشان كده **لازم تحدثيه يدوياً** بالخطوات اللي فوق! ✅

---

## 📞 لو لسه المشكلة موجودة:

اعمليلي screenshot من:
1. محتوى `config.env` (السطرين بتوع MYFATOORAH_SUCCESS_URL و ERROR_URL)
2. الـ URL اللي بيظهر بعد الدفع
3. output من `pm2 logs`
