const express = require("express");
const router = express.Router();
const offerController = require("../controllers/offer.controller");
const { getAllOffersValidator, getOfferValidator, createOfferValidator, updateOfferValidator, deleteOfferValidator } = require("../validators/offer.validation");

const Auth = require('../controllers/auth.controller');

// ============================
// 🟢 Get All Offers
// مع إمكانية فلترة بـ productId / subCategoryId / subSubCategoryId / categoryId
// ============================
router.get("/", getAllOffersValidator, offerController.getAllOffers);

// ============================
// 🟢 Get Single Offer
// ============================
router.get("/:id", getOfferValidator, offerController.getOffer);

// ============================
// 🟢 Create Offer
// ============================
router.post("/",    Auth.protect,
    Auth.allowedTo('admin'), createOfferValidator, offerController.createOffer);

// ============================
// 🟢 Update Offer
// ============================
router.put("/:id",    Auth.protect,
    Auth.allowedTo('admin'), updateOfferValidator, offerController.updateOffer);

// ============================
// 🟢 Delete Offer
// ============================
router.delete("/:id",    Auth.protect,
    Auth.allowedTo('admin'), deleteOfferValidator, offerController.deleteOffer);

module.exports = router;
