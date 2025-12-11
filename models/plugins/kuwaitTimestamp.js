const { kuwaitiDateNow } = require('../../utils/dateUtils');

module.exports = function(schema) {
  // Disable default timestamps since we handle them manually
  schema.set('timestamps', false);

  // Add fields manually
  schema.add({
    createdAt: {
      type: Date,
      default: kuwaitiDateNow
    },
    updatedAt: {
      type: Date,
      default: kuwaitiDateNow
    }
  });

  // Pre-save hook for new documents
  schema.pre('save', function(next) {
    const now = kuwaitiDateNow();
    if (this.isNew) {
      this.createdAt = now;
    }
    this.updatedAt = now;
    next();
  });

  // Pre-update hooks (findOneAndUpdate, updateOne, etc.)
  // We need to explicitly set updatedAt on updates
  const updateHooks = ['findOneAndUpdate', 'update', 'updateOne', 'updateMany'];
  
  updateHooks.forEach((hook) => {
    schema.pre(hook, function(next) {
      const now = kuwaitiDateNow();
      
      // Check if update is an object (standard case)
      if (this._update) {
         // Create $set if it doesn't exist
         if (!this._update.$set) {
            this._update.$set = {};
         }
         this._update.$set.updatedAt = now;
      }
      next();
    });
  });
};
