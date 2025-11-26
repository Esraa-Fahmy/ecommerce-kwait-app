# ✅ إصلاح مشكلة الشحن المجاني

## المشكلة
لما بيكون في عرض شحن مجاني أو `shippingCost: 0`، وقت الدفع بالفيزا بيطلع error:
```
invoice total value must be the same total items value
```

## السبب
كان الكود بيستخدم:
```javascript
shippingCost: totals.shippingPrice || shippingCost
```

لما `totals.shippingPrice` = 0 (شحن مجاني)، الـ `||` operator كان بيعتبرها `falsy` ويرجع للـ `shippingCost` الأصلي (مثلاً 65 د.ك).

## الحل ✅
تم تعديل الكود في `orderController.js` ليستخدم:
```javascript
shippingCost: totals.shippingPrice
```

دلوقتي لو `totals.shippingPrice` = 0، هيستخدم 0 مباشرة.

---

## 🔴 مهم جداً: لازم تعملي Restart للـ Server!

### على السيرفر:
```bash
pm2 restart all
```

أو لو بتشتغلي locally:
```bash
# أوقفي الـ server (Ctrl+C)
# وشغليه تاني
npm start
```

---

## كيف تتأكدي إن المشكلة اتحلت؟

### 1. اعملي Order جديد بشحن مجاني
```json
{
  "cartId": "...",
  "addressId": "...",
  "paymentMethod": "visa",
  "coupon": "..." // optional
}
```

### 2. شوفي الـ Response
لازم يكون:
```json
{
  "shippingCost": 0,  // ✅ صفر لو في free shipping
  "total": 540        // ✅ = subtotal - discount + 0
}
```

### 3. ابدئي الدفع
```json
{
  "orderId": "...",
  "paymentMethodId": "..."
}
```

### 4. النتيجة المتوقعة
- ✅ مفيش error "invoice total value must be the same total items value"
- ✅ بيفتح صفحة الدفع عادي
- ✅ الدفع بيتم بنجاح

---

## التعديلات اللي اتعملت

### [`orderController.js`](file:///e:/3roud-App/controllers/orderCotroller.js#L143-L163)
```diff
- const shipping = await Shipping.findOne({ city: address.city });
- const shippingCost = shipping ? shipping.cost : 0;
-
  const totals = await calculateOrderTotals(cart, coupon, req.user, address.city);

  const order = await Order.create({
    ...
-   shippingCost: totals.shippingPrice || shippingCost,
+   shippingCost: totals.shippingPrice,
    ...
  });
  
  await order.populate("user", "firstName lastName email phone");
+ await order.populate("cartItems.appliedOffer");
```

### [`myFatoorah.js`](file:///e:/3roud-App/utils/myFatoorah.js#L51-L55)
```diff
  const invoiceItems = cartItems.map(item => ({
-   ItemName: item.name || item.product?.name || 'Product',
+   ItemName: item.title || item.name || item.product?.title || item.product?.name || 'Product',
    Quantity: item.quantity,
-   UnitPrice: item.price,
+   UnitPrice: item.priceAfterOffer || item.price,
  }));
```

---

## ملاحظات مهمة

1. **الـ Orders القديمة**: اللي اتعملت قبل التعديل مش هتتأثر
2. **لازم Restart**: التعديلات مش هتشتغل إلا بعد restart للـ server
3. **الـ Free Shipping**: بيتحسب في `calculateOrderTotals()` بناءً على:
   - `cart.hasFreeShipping` (من السلة)
   - عروض الشحن المجاني النشطة
   - الحد الأدنى لقيمة السلة (لو موجود)

4. **الـ appliedOffer**: دلوقتي بيرجع في الـ order response مع كل التفاصيل بما فيها `title`
