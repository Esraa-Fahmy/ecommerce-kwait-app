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
  const {
    shippingAddress, // object with firstName,lastName, city, governorate, street, building, apartment, floor, phone, type, note ...
    paymentMethod, // 'cod' or 'card'
    couponCode, // optional
    createdAtClient,
  } = req.body;

  if (!paymentMethod || !["cod", "card"].includes(paymentMethod)) {
    return next(new ApiError("Invalid payment method", 400));
  }

  // 1) load cart
  const cart = await findActiveCartAndPopulate(userId);
  if (!cart || !cart.cartItems || cart.cartItems.length === 0) {
    return next(new ApiError("Cart is empty", 400));
  }

  // 2) check stock and build order items applying item-level offers
  let totalBeforeDiscount = 0; // sum base price * qty
  let subtotalAfterItemOffers = 0; // after product-level offers
  let discountDetails = [];

  const itemsForOrder = [];

  for (const cartItem of cart.cartItems) {
    const prod = cartItem.product;
    if (!prod) continue;

    // check stock availability
    if (prod.quantity <= 0) {
      // skip out-of-stock items (could also fail the order, but we prefer to fail)
      return next(new ApiError(`Product ${prod.title} is out of stock`, 400));
    }
    if (cartItem.quantity > prod.quantity) {
      return next(new ApiError(`Only ${prod.quantity} units available for ${prod.title}`, 400));
    }

    const qty = Number(cartItem.quantity || 1);
    const basePrice = Number(prod.price) || 0;
    totalBeforeDiscount += basePrice * qty;

    // apply best product-level offer
    const best = await applyBestItemOffer(prod, qty);
    const priceAfterOffer = Number(best.priceAfterOffer);
    subtotalAfterItemOffers += priceAfterOffer * qty;

    if (best.appliedOffer) {
      discountDetails.push({
        source: `offer:${best.appliedOffer._id.toString()}`,
        type: best.appliedOffer.offerType,
        value: best.appliedOffer.discountValue ?? null,
        amount: Number((basePrice - priceAfterOffer) * qty) || 0,
      });
    }

    // prepare order item snapshot (including selected attributes stored in cart)
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
      priceAfterOffer: priceAfterOffer,
    });
  }

  // 3) shipping cost (admin-maintained shipping table)
  let shippingPrice = 0;
  let shippingReason = "normal";
  if (shippingAddress && shippingAddress.city) {
    const cityDoc = await Shipping.findOne({ city: shippingAddress.city });
    if (cityDoc) {
      shippingPrice = Number(cityDoc.cost || 0);
    }
  }

  // 4) gather active cart-level offers and coupons
  const now = new Date();
  const activeOffers = await Offer.find({
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  });

  // 4.a) handle freeShipping offers
  for (const off of activeOffers) {
    if (off.offerType === "freeShipping") {
      // condition: optionally minCartValue or other checks can be added
      if (!off.minCartValue || subtotalAfterItemOffers >= off.minCartValue) {
        shippingPrice = 0;
        shippingReason = `freeShipping:${off._id.toString()}`;
        discountDetails.push({
          source: `offer:${off._id.toString()}`,
          type: "freeShipping",
          value: null,
          amount: 0,
        });
        break;
      }
    }
  }

  // 5) apply coupon (if provided) and cartDiscount. We'll:
  //    - compute couponDiscountAmount (if coupon valid)
  //    - compute bestCartDiscountAmount (from offers of type cartDiscount)
  //    - choose the one with larger amount (not stacking coupon + cartDiscount). Coupon plus product offers is ok.
  let totalDiscount = 0;
  let totalAfterDiscount = subtotalAfterItemOffers;
  let couponApplied = null;

  if (couponCode) {
    const coupon = activeOffers.find(
      (o) => o.offerType === "coupon" && o.couponCode && o.couponCode.toLowerCase() === couponCode.toLowerCase()
    );
    if (!coupon) return next(new ApiError("Invalid or expired coupon", 400));

    // validate minCartValue or userGroup if needed
    if (coupon.minCartValue && subtotalAfterItemOffers < coupon.minCartValue) {
      return next(new ApiError(`Coupon requires minimum cart value ${coupon.minCartValue}`, 400));
    }

    let couponAmount = 0;
    if (coupon.discountValue != null) {
      if (coupon.discountValue < 1) {
        // percent stored as 0.xx or maybe as number <=100? we expect percent value as number (if <1 treat as fraction)
        couponAmount = subtotalAfterItemOffers * coupon.discountValue;
      } else {
        couponAmount = coupon.discountValue;
      }
    }

    couponApplied = coupon;
    totalAfterDiscount = subtotalAfterItemOffers - couponAmount;
    if (totalAfterDiscount < 0) totalAfterDiscount = 0;
    totalDiscount = (subtotalAfterItemOffers - totalAfterDiscount);
    if (totalDiscount > 0) {
      discountDetails.push({
        source: `coupon:${coupon.couponCode}`,
        type: coupon.discountValue < 1 ? "percentage" : "fixed",
        value: coupon.discountValue,
        amount: Number(totalDiscount),
      });
    }
  }

  // compute best cartDiscount (if any)
  let bestCartOffer = null;
  let bestCartOfferAmount = 0;
  for (const off of activeOffers) {
    if (off.offerType === "cartDiscount") {
      if (off.minCartValue && subtotalAfterItemOffers < off.minCartValue) continue;
      let amount = 0;
      if (off.discountValue != null) {
        if (off.discountValue < 1) amount = subtotalAfterItemOffers * off.discountValue;
        else amount = off.discountValue;
      }
      if (amount > bestCartOfferAmount) {
        bestCartOfferAmount = amount;
        bestCartOffer = off;
      }
    }
  }

  // If coupon existed, compare coupon vs cartDiscount => pick bigger (do not stack)
  if (bestCartOffer) {
    if (!couponApplied) {
      // apply cartOffer
      totalAfterDiscount = subtotalAfterItemOffers - bestCartOfferAmount;
      if (totalAfterDiscount < 0) totalAfterDiscount = 0;
      totalDiscount += bestCartOfferAmount;
      discountDetails.push({
        source: `offer:${bestCartOffer._id.toString()}`,
        type: bestCartOffer.discountValue < 1 ? "percentage" : "fixed",
        value: bestCartOffer.discountValue,
        amount: Number(bestCartOfferAmount),
      });
    } else {
      // coupon applied — check whether cartOffer gives better discount than coupon
      // couponDiscount was totalDiscount (above). Compare to bestCartOfferAmount.
      if (bestCartOfferAmount > totalDiscount) {
        // replace coupon effect with cart offer
        // remove coupon entry from discountDetails:
        discountDetails = discountDetails.filter(d => !(d.source && d.source.startsWith("coupon:")));
        // apply cart offer instead
        totalDiscount = bestCartOfferAmount;
        totalAfterDiscount = subtotalAfterItemOffers - bestCartOfferAmount;
        discountDetails.push({
          source: `offer:${bestCartOffer._id.toString()}`,
          type: bestCartOffer.discountValue < 1 ? "percentage" : "fixed",
          value: bestCartOffer.discountValue,
          amount: Number(bestCartOfferAmount),
        });
      }
      // else keep coupon as applied (already in discountDetails)
    }
  }

  // 6) final totals (include shipping for COD; for card we may still include shipping)
  // you said: "لو اختار الدفع عند الاستلام هيهُر سعر الشحن للمكان بتاعه وبيضاف ع اجمالي" — so always add shippingPrice to final payable.
  const totalBefore = Number(totalBeforeDiscount) || 0;
  const totalAfterItemsAndCartOffers = Number(totalAfterDiscount) || Number(subtotalAfterItemOffers || 0);
  const finalTotal = Number(totalAfterItemsAndCartOffers) + Number(shippingPrice || 0);

  // 7) create order doc
  const orderDoc = await Order.create({
    user: userId,
    items: itemsForOrder,
    shippingAddress,
    paymentMethod,
    shippingPrice,
    coupon: couponApplied
      ? {
          code: couponApplied.couponCode,
          discountType: couponApplied.discountValue < 1 ? "percentage" : "fixed",
          discountValue: couponApplied.discountValue,
        }
      : undefined,
    totalBeforeDiscount: totalBefore,
    totalDiscount: Number(totalDiscount) || 0,
    totalAfterDiscount: Number(totalAfterItemsAndCartOffers),
    discountDetails,
    status: "pending",
    createdAtClient: createdAtClient ? new Date(createdAtClient) : undefined,
  });

  // 8) clear user's cart
  await Cart.findOneAndDelete({ user: userId });

  // 9) respond with full summary
  res.status(201).json({
    status: "success",
    data: {
      order: orderDoc,
      summary: {
        totalBefore,
        totalAfterDiscount: Number(totalAfterItemsAndCartOffers),
        totalDiscount: Number(totalDiscount) || 0,
        discountDetails,
        shippingPrice,
        finalTotal,
      },
    },
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