// controllers/orderController.js
const asyncHandler = require("express-async-handler");
const ApiError = require("../utils/apiError");
const Cart = require("../models/cartModel");            // انت كنت بتستخدم هذا الاسم
const Order = require("../models/orderModel");
const Product = require("../models/product.model");
const Offer = require("../models/offer.model");
const Shipping = require("../models/shippingModel");   // لو عندك file اسم مختلف عدّلي المسار
const mongoose = require("mongoose");

/**
 * Helpers:
 *  - applyBestItemOffer(itemProduct, qty) => { priceAfterOffer, appliedOffer || null, amountSaved }
 *  - chooseBestCartCoupon(total, couponOffer, cartOffers) => applies coupon or cartDiscount (the best single cart-level discount)
 */

const applyBestItemOffer = async (product, qty) => {
  // product is populated document
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
  if (!offers || offers.length === 0) {
    return {
      priceAfterOffer: basePrice,
      appliedOffer: null,
      amountSaved: 0,
    };
  }

  // pick best offer among product-related offers (we'll evaluate each and pick the one giving max saving)
  let best = {
    priceAfterOffer: basePrice,
    appliedOffer: null,
    amountSaved: 0,
  };

  for (const off of offers) {
    let candidatePrice = basePrice;

    if (off.offerType === "percentage" && typeof off.discountValue === "number") {
      candidatePrice = basePrice - (basePrice * off.discountValue) / 100;
    } else if (off.offerType === "fixed" && typeof off.discountValue === "number") {
      candidatePrice = basePrice - off.discountValue;
    } else if (off.offerType === "buyXgetY" && typeof off.buyQuantity === "number" && typeof off.getQuantity === "number") {
      // translate buyXgetY into effective unit price:
      if (qty >= off.buyQuantity) {
        const group = off.buyQuantity + off.getQuantity;
        const freeGroups = Math.floor(qty / group);
        const freeItems = freeGroups * off.getQuantity;
        const paidItems = qty - freeItems;
        candidatePrice = paidItems > 0 ? (paidItems * basePrice) / qty : 0;
      }
    } else if (off.offerType === "freeShipping") {
      // freeShipping doesn't change item price
      candidatePrice = basePrice;
    }

    if (isNaN(candidatePrice) || candidatePrice < 0) candidatePrice = 0;

    const saved = (basePrice - candidatePrice) * qty;
    if (saved > best.amountSaved) {
      best = {
        priceAfterOffer: Number(candidatePrice),
        appliedOffer: off,
        amountSaved: saved,
      };
    }
  }

  return best;
};

const findActiveCartAndPopulate = async (userId) => {
  const cart = await Cart.findOne({ user: userId }).populate({
    path: "cartItems.product",
    select:
      "title price imageCover code colors sizes Material quantity category subCategory subSubCategory",
  });
  return cart;
};

// =================== Create Order ===================
exports.createOrder = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  let { shippingAddress, paymentMethod, couponCode, createdAtClient } = req.body;

  if (typeof shippingAddress === "string") shippingAddress = JSON.parse(shippingAddress);

  if (!paymentMethod || !['cod','card'].includes(paymentMethod))
    return next(new ApiError("Invalid payment method", 400));

  const cart = await findActiveCartAndPopulate(userId);
  if (!cart || !cart.cartItems.length)
    return next(new ApiError("Cart is empty", 400));

  let totalBeforeDiscount = 0, subtotalAfterItemOffers = 0, discountDetails = [], itemsForOrder = [];

  for (const cartItem of cart.cartItems) {
    const prod = cartItem.product;
    if (!prod) continue;
    if (prod.quantity < cartItem.quantity) 
      return next(new ApiError(`Only ${prod.quantity} units available for ${prod.title}`, 400));

    const qty = Number(cartItem.quantity || 1);
    const basePrice = Number(prod.price) || 0;
    totalBeforeDiscount += basePrice * qty;

    const best = await applyBestItemOffer(prod, qty);
    subtotalAfterItemOffers += best.priceAfterOffer * qty;

    if (best.appliedOffer) {
      discountDetails.push({
        source: `offer:${best.appliedOffer._id}`,
        type: best.appliedOffer.offerType,
        value: best.appliedOffer.discountValue ?? null,
        amount: Number((basePrice - best.priceAfterOffer) * qty)
      });
    }

    const selectedAttributes = {};
    if (cartItem.color) selectedAttributes.color = cartItem.color;
    if (cartItem.size) selectedAttributes.size = cartItem.size;
    if (cartItem.Material) selectedAttributes.Material = cartItem.Material;

    itemsForOrder.push({
      product: prod._id,
      productCode: prod.code,
      title: prod.title,
      description: prod.description || "",
      imageCover: prod.imageCover || "",
      selectedAttributes,
      quantity: qty,
      price: basePrice,
      priceAfterOffer: best.priceAfterOffer
    });
  }

  let shippingPrice = 0;
  if (shippingAddress?.city) {
    const cityDoc = await Shipping.findOne({ city: shippingAddress.city });
    if (cityDoc) shippingPrice = Number(cityDoc.cost || 0);
  }

  // coupon logic
  let totalAfterDiscount = subtotalAfterItemOffers;
  let totalDiscount = 0;
  let couponApplied = null;
  const now = new Date();
  const activeOffers = await Offer.find({ isActive: true, startDate: { $lte: now }, endDate: { $gte: now } });

  if (couponCode) {
    const coupon = activeOffers.find(o => o.offerType === "coupon" && o.couponCode?.toLowerCase() === couponCode.toLowerCase());
    if (!coupon) return next(new ApiError("Invalid or expired coupon", 400));
    if (coupon.minCartValue && subtotalAfterItemOffers < coupon.minCartValue)
      return next(new ApiError(`Coupon requires minimum cart value ${coupon.minCartValue}`, 400));

    let couponAmount = 0;
    if (coupon.discountValue != null) {
      couponAmount = coupon.discountValue < 1 ? subtotalAfterItemOffers * coupon.discountValue : coupon.discountValue;
    }

    couponApplied = coupon;
    totalAfterDiscount -= couponAmount;
    if (totalAfterDiscount < 0) totalAfterDiscount = 0;
    totalDiscount = subtotalAfterItemOffers - totalAfterDiscount;

    discountDetails.push({
      source: `coupon:${coupon.couponCode}`,
      type: coupon.discountValue < 1 ? "percentage" : "fixed",
      value: coupon.discountValue,
      amount: Number(totalDiscount)
    });
  }

  const finalTotal = totalAfterDiscount + shippingPrice;

  const orderDoc = await Order.create({
    user: userId,
    items: itemsForOrder,
    shippingAddress,
    paymentMethod,
    shippingPrice,
    coupon: couponApplied ? {
      code: couponApplied.couponCode,
      discountType: couponApplied.discountValue < 1 ? "percentage" : "fixed",
      discountValue: couponApplied.discountValue
    } : undefined,
    totalBeforeDiscount,
    totalDiscount,
    totalAfterDiscount,
    discountDetails,
    status: "pending",
    createdAtClient: createdAtClient ? new Date(createdAtClient) : undefined,
  });

  await Cart.findOneAndDelete({ user: userId });

  res.status(201).json({
    status: "success",
    data: { order: orderDoc, summary: { totalBefore: totalBeforeDiscount, totalAfterDiscount, totalDiscount, discountDetails, shippingPrice, finalTotal } }
  });
});


// =================== Get user's orders ===================
exports.getMyOrders = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const { status, q, page = 1, limit = 20 } = req.query;

  const filter = { user: userId };
  if (status) filter.status = status;
  if (q) {
    // simple search on product title or order id
    const regex = new RegExp(q, "i");
    filter.$or = [
      { "items.title": regex },
      { _id: mongoose.Types.ObjectId.isValid(q) ? mongoose.Types.ObjectId(q) : null },
    ];
  }

  const skip = (page - 1) * limit;
  const orders = await Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit));
  const total = await Order.countDocuments(filter);

  res.status(200).json({ status: "success", total, results: orders.length, data: orders });
});

// =================== Get single order (owner or admin) ===================
exports.getOrderById = asyncHandler(async (req, res, next) => {
  const id = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(id)) return next(new ApiError("Invalid order id", 400));

  const order = await Order.findById(id);
  if (!order) return next(new ApiError("Order not found", 404));

  // allow owner or admin (caller middleware should fill req.user)
  if (order.user.toString() !== req.user._id.toString() && req.user.role !== "admin") {
    return next(new ApiError("You are not allowed to access this order", 403));
  }

  res.status(200).json({ status: "success", data: order });
});

// =================== User cancel order (only when pending) ===================
exports.cancelOrderByUser = asyncHandler(async (req, res, next) => {
  const id = req.params.id;
  const order = await Order.findById(id);
  if (!order) return next(new ApiError("Order not found", 404));
  if (order.user.toString() !== req.user._id.toString()) return next(new ApiError("Not allowed", 403));
  if (order.status !== "pending") return next(new ApiError("You can cancel order only when it's pending", 400));

  order.status = "cancelled_by_user";
  await order.save();

  res.status(200).json({ status: "success", message: "Order cancelled", data: order });
});

// =================== Admin: get all orders (filter/search) ===================
exports.adminGetAllOrders = asyncHandler(async (req, res, next) => {
  const { status, q, page = 1, limit = 30 } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (q) filter.$or = [{ _id: mongoose.Types.ObjectId.isValid(q) ? mongoose.Types.ObjectId(q) : null }, { "items.title": new RegExp(q, "i") }];

  const skip = (page - 1) * limit;
  const orders = await Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit));
  const total = await Order.countDocuments(filter);

  res.status(200).json({ status: "success", total, results: orders.length, data: orders });
});

// =================== Admin: update order status ===================
/**
 * body: { status: 'confirmed' | 'in_preparation' | 'out_for_delivery' | 'delivered' | 'rejected' | 'returned' | ... }
 *
 * Business rule:
 *  - if order.status === 'cancelled_by_user' and admin tries to confirm -> reject action
 *  - when status -> 'delivered' : decrement stock and increment sold
 */
exports.adminUpdateOrderStatus = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) return next(new ApiError("Status is required", 400));
  const allowed = ['pending','confirmed','in_preparation','out_for_delivery','delivered','cancelled_by_user','rejected','returned','refunded','delivery_failed'];
  if (!allowed.includes(status)) return next(new ApiError("Invalid status", 400));

  const order = await Order.findById(id);
  if (!order) return next(new ApiError("Order not found", 404));

  // cannot confirm if user already cancelled
  if (order.status === "cancelled_by_user" && status === "confirmed") {
    return next(new ApiError("Cannot confirm an order cancelled by user", 400));
  }

  // update status
  order.status = status;

  // if delivered -> adjust stock
  if (status === "delivered") {
    for (const item of order.items) {
      const prod = await Product.findById(item.product);
      if (!prod) continue;
      const soldQty = Number(item.quantity || 0);
      // decrement stock, increment sold
      prod.quantity = Math.max(0, (Number(prod.quantity || 0) - soldQty));
      prod.sold = Number(prod.sold || 0) + soldQty;
      await prod.save();
    }
  }

  await order.save();
  res.status(200).json({ status: "success", message: "Order status updated", data: order });
});



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