# 🚀 خطوات النشر السريعة

## ✅ ما تم عمله في الكود:

تم إضافة سطر واحد في `app.js` لخدمة الصفحات من مجلد `public/`:
```javascript
app.use(express.static(path.join(__dirname, "public")));
```

الآن الملفات في `public/` ستكون متاحة مباشرة على:
- `https://3roood.com/payment-success.html`
- `https://3roood.com/payment-error.html`

---

## 📋 خطوات النشر على السيرفر:

### 1️⃣ تحديث الكود على السيرفر

```bash
# على السيرفر
cd ~/ecommerce-kwait-app

# سحب آخر تحديثات
git pull origin main
# أو إذا كنتِ تستخدمين branch آخر:
# git pull origin your-branch-name
```

### 2️⃣ تحديث config.env (تم بالفعل ✅)

الـ URLs في `config.env` صحيحة:
```env
MYFATOORAH_SUCCESS_URL=https://3roood.com/payment-success.html
MYFATOORAH_ERROR_URL=https://3roood.com/payment-error.html
```

### 3️⃣ إعادة تشغيل Backend

```bash
pm2 restart all
```

### 4️⃣ اختبار

افتحي في المتصفح:
```
https://3roood.com/payment-success.html?paymentId=test123&orderId=order456
```

يجب أن تري صفحة جميلة بالعربي مع محاولة فتح التطبيق! ✅

---

## 🔍 استكشاف الأخطاء:

### إذا ظهر `Cannot GET /payment-success.html`:

1. **تأكدي أن مجلد `public/` موجود:**
   ```bash
   cd ~/ecommerce-kwait-app
   ls -la public/
   ```
   يجب أن تري:
   - `payment-success.html`
   - `payment-error.html`

2. **تأكدي أن الكود محدّث:**
   ```bash
   grep -n "public" app.js
   ```
   يجب أن تري السطر:
   ```
   app.use(express.static(path.join(__dirname, "public")));
   ```

3. **تأكدي أن PM2 أعاد التشغيل:**
   ```bash
   pm2 logs --lines 20
   ```

4. **أعيدي التشغيل يدوياً:**
   ```bash
   pm2 restart all
   pm2 logs
   ```

---

## ✨ الخلاصة:

- ✅ الكود محدّث في `app.js`
- ✅ الصفحات موجودة في `public/`
- ✅ الـ URLs في `config.env` صحيحة
- 🔄 فقط اعملي `git pull` و `pm2 restart all`

---

## 💬 لمطور Flutter:

لا تغيير! نفس التعليمات السابقة:

**Deep Links:**
- Success: `3roudapp://payment-success?paymentId=xxx&orderId=yyy`
- Error: `3roudapp://payment-error?message=xxx`

راجع [walkthrough.md](file:///C:/Users/DELL/.gemini/antigravity/brain/aa61ff7a-720c-4b68-9f1e-7f397031aa19/walkthrough.md) للتفاصيل الكاملة.
