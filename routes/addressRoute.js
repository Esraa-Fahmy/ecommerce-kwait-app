const express = require("express");
const {
  addAddress,
  getUserAddresses,
  updateAddress,
  deleteAddress,
} = require("../controllers/adressesController");
const auth = require("../controllers/auth.controller");

const router = express.Router();

router.use(auth.protect);

router.post("/", auth.protect,  auth.allowedTo('user'), addAddress);
router.get("/",getUserAddresses);
router.patch("/:id", auth.protect, auth.allowedTo('user'), updateAddress);
router.delete("/:id", auth.protect, auth.allowedTo('user'), deleteAddress);

module.exports = router;
