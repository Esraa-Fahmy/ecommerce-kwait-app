const admin = require('firebase-admin');
const serviceAccount = require('../roood-739e1-firebase-adminsdk.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

module.exports = admin;
