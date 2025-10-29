// controllers/orderController.js
const asyncHandler = require("express-async-handler");
const ApiError = require("../utils/apiError");
const Cart = require("../models/cartModel");
const Order = require("../models/orderModel");
const Product = require("../models/product.model");
const Offer = require("../models/offer.model");
const Shipping = require("../models/shippingModel");
const mongoose = require("mongoose");

// ========== Helper functions ==========
const applyBestItemOffer = async (product, qty) => {
  const now = new Date();
  const offers = await Offer.find({
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
    $or: [
      { targetType: "product", targetIds: product._id },
      { targetType: "subcategory", targetIds: product.subCategory },
      { targetType: "subSubcategory", targetIds: product.subSubCategory },
      { targetType: "category", targetIds: product.category },
    ],
  }).sort({ priority: -1, createdAt: -1 });

  const basePrice = Number(product.price) || 0;
  if (!offers.length) {
    return { priceAfterOffer: basePrice, appliedOffer: null, amountSaved: 0 };
  }

  let best = { priceAfterOffer: basePrice, appliedOffer: null, amountSaved: 0 };
  for (const off of offers) {
    let candidatePrice = basePrice;

    if (off.offerType === "percentage") {
      candidatePrice = basePrice - (basePrice * off.discountValue) / 100;
    } else if (off.offerType === "fixed") {
      candidatePrice = basePrice - off.discountValue;
    } else if (off.offerType === "buyXgetY") {
      if (qty >= off.buyQuantity) {
        const group = off.buyQuantity + off.getQuantity;
        const freeGroups = Math.floor(qty / group);
        const freeItems = freeGroups * off.getQuantity;
        const paidItems = qty - freeItems;
        candidatePrice = (paidItems * basePrice) / qty;
      }
    }

    const saved = (basePrice - candidatePrice) * qty;
    if (saved > best.amountSaved) {
      best = { priceAfterOffer: candidatePrice, appliedOffer: off, amountSaved: saved };
    }
  }
  return best;
};

const findActiveCartAndPopulate = async (userId) => {
  return await Cart.findOne({ user: userId }).populate({
    path: "cartItems.product",
    select: "title price imageCover code colors sizes Material quantity category subCategory subSubCategory",
  });
};

// =================== Create Order ===================
exports.createOrder = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const { shippingAddress, paymentMethod, couponCode, createdAtClient } = req.body;

  if (!paymentMethod || !["cod", "card"].includes(paymentMethod)) {
    return next(new ApiError("Invalid payment method", 400));
  }

  const cart = await findActiveCartAndPopulate(userId);
  if (!cart || !cart.cartItems.length) {
    return next(new ApiError("Cart is empty", 400));
  }

  let totalBeforeDiscount = 0;
  let subtotalAfterItemOffers = 0;
  let discountDetails = [];
  let skippedProducts = [];
  const itemsForOrder = [];

  for (const cartItem of cart.cartItems) {
    const prod = cartItem.product;
    if (!prod) continue;

    if (prod.quantity <= 0) {
      skippedProducts.push(`${prod.title} (Out of stock)`);
      continue;
    }
    if (cartItem.quantity > prod.quantity) {
      skippedProducts.push(`${prod.title} (only ${prod.quantity} available)`);
      continue;
    }

    const qty = Number(cartItem.quantity);
    const basePrice = Number(prod.price);
    totalBeforeDiscount += basePrice * qty;

    const best = await applyBestItemOffer(prod, qty);
    subtotalAfterItemOffers += best.priceAfterOffer * qty;

    if (best.appliedOffer) {
      discountDetails.push({
        source: `offer:${best.appliedOffer._id}`,
        type: best.appliedOffer.offerType,
        value: best.appliedOffer.discountValue ?? null,
        amount: (basePrice - best.priceAfterOffer) * qty,
      });
    }

    itemsForOrder.push({
      product: prod._id,
      title: prod.title,
      imageCover: prod.imageCover,
      quantity: qty,
      price: basePrice,
      priceAfterOffer: best.priceAfterOffer,
      selectedAttributes: {
        color: cartItem.color,
        size: cartItem.size,
        Material: cartItem.Material,
      },
    });
  }

  if (!itemsForOrder.length) {
    return next(
      new ApiError(
        `All products in your cart are out of stock: ${skippedProducts.join(", ")}`,
        400
      )
    );
  }

  // حذف العناصر اللي خلصت من الكارت
  if (skippedProducts.length) {
    cart.cartItems = cart.cartItems.filter(
      (item) => item.product && item.product.quantity > 0
    );
    await cart.save();
  }

  // 🟩 Shipping
  let shippingPrice = 0;
  let shippingReason = "normal";
  if (shippingAddress?.city) {
    const cityDoc = await Shipping.findOne({ city: shippingAddress.city });
    if (cityDoc) shippingPrice = Number(cityDoc.cost || 0);
  }

  // 🟩 Offers & coupons (نفس منطقك السابق)
  const now = new Date();
  const activeOffers = await Offer.find({
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  });

  let totalDiscount = 0;
  let totalAfterDiscount = subtotalAfterItemOffers;
  let couponApplied = null;

  if (couponCode) {
    const coupon = activeOffers.find(
      (o) => o.offerType === "coupon" && o.couponCode?.toLowerCase() === couponCode.toLowerCase()
    );
    if (!coupon) return next(new ApiError("Invalid or expired coupon", 400));
    let couponAmount = coupon.discountValue < 1
      ? subtotalAfterItemOffers * coupon.discountValue
      : coupon.discountValue;
    couponApplied = coupon;
    totalAfterDiscount -= couponAmount;
    if (totalAfterDiscount < 0) totalAfterDiscount = 0;
    totalDiscount += couponAmount;
    discountDetails.push({
      source: `coupon:${coupon.couponCode}`,
      type: coupon.discountValue < 1 ? "percentage" : "fixed",
      value: coupon.discountValue,
      amount: couponAmount,
    });
  }

  const totalBefore = totalBeforeDiscount;
  const finalTotal = totalAfterDiscount + shippingPrice;

  const orderDoc = await Order.create({
    user: userId,
    items: itemsForOrder,
    shippingAddress,
    paymentMethod,
    shippingPrice,
    coupon: couponApplied
      ? { code: couponApplied.couponCode, discountValue: couponApplied.discountValue }
      : undefined,
    totalBeforeDiscount: totalBefore,
    totalDiscount,
    totalAfterDiscount,
    discountDetails,
    status: "pending",
    createdAtClient: createdAtClient ? new Date(createdAtClient) : undefined,
  });

  await Cart.findOneAndDelete({ user: userId });

  res.status(201).json({
    status: "success",
    message: skippedProducts.length
      ? `Order created but some items skipped: ${skippedProducts.join(", ")}`
      : "Order created successfully",
    data: {
      order: orderDoc,
      summary: {
        totalBefore,
        totalAfterDiscount,
        totalDiscount,
        shippingPrice,
        finalTotal,
      },
      skippedProducts,
    },
  });
});

// =================== Admin Bulk Update ===================
exports.bulkUpdateOrderStatus = asyncHandler(async (req, res, next) => {
  const { orderIds, newStatus } = req.body;

  if (!Array.isArray(orderIds) || !orderIds.length)
    return next(new ApiError("Order IDs are required", 400));

  if (!newStatus)
    return next(new ApiError("New status is required", 400));

  const orders = await Order.find({ _id: { $in: orderIds } });
  if (!orders.length) return next(new ApiError("No matching orders found", 404));

  let updatedCount = 0;
  for (const order of orders) {
    if (order.status === "cancelled_by_user") continue;

    order.status = newStatus;

    // ⬇️ تقليل المخزون لو الحالة delivered
    if (newStatus === "delivered") {
      for (const item of order.items) {
        const prod = await Product.findById(item.product);
        if (!prod) continue;
        const soldQty = Number(item.quantity || 0);
        prod.quantity = Math.max(0, (prod.quantity || 0) - soldQty);
        prod.sold = (prod.sold || 0) + soldQty;
        await prod.save();
      }
    }

    await order.save();
    updatedCount++;
  }

  res.status(200).json({
    status: "success",
    message: `${updatedCount} orders updated successfully`,
  });
});
