const path = require("path");
const express = require("express");
const dotenv = require("dotenv");
const cors = require('cors');
const compression = require("compression");
const http = require("http"); // ⬅️ استيراد http لإنشاء السيرفر
dotenv.config({ path: "config.env" });
const dbConnection = require("./config/database");
//const ApiError = require("./utils/apiError");
const globalError = require("./middlewares/errmiddleware");


dbConnection();

const app = express();

// Middleware
app.use(compression());

app.use(cors());


app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "uploads")));





// Mount Routes
app.use("/api/v1/categories", require("./routes/category.route"));
app.use("/api/v1/subCategories", require("./routes/subcategory.route"));
app.use("/api/v1/subSubCategories", require("./routes/subSubCategoryRoute"));
app.use("/api/v1/user", require("./routes/user.route"));
app.use("/api/v1/auth", require("./routes/auth.route"));
app.use("/api/v1/product", require("./routes/product.route"));






// Global Error Handler
/*app.all("*", (req, res, next) => {
  next(new ApiError(`Can't find this route: ${req.originalUrl}`, 400));
});*/
app.use(globalError);


const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});