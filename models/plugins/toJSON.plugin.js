/**
 * toJSON plugin for Mongoose
 * @param {Schema} schema - Mongoose schema
 * @param {Object} options - Plugin options
 */
const toJSON = (schema) => {
  // Define the transform function for the toJSON option
  const transform = function (doc, ret, options) {
    // Remove version key and internal fields
    delete ret.__v;
    
    // Convert _id to id and remove _id
    if (ret._id && !ret.id) {
      ret.id = ret._id.toString();
    }
    delete ret._id;
    
    // Remove password fields from the output
    if (ret.password) {
      delete ret.password;
    }
    
    // Remove any fields that start with _ (internal fields)
    Object.keys(ret).forEach((key) => {
      if (key.startsWith('_')) {
        delete ret[key];
      }
    });
    
    // Apply any schema-specific transformations
    if (typeof schema.options.toJSON.transform === 'function') {
      return schema.options.toJSON.transform(doc, ret, options);
    }
    
    return ret;
  };
  
  // Set the toJSON option on the schema if it doesn't exist
  if (!schema.options.toJSON) {
    schema.options.toJSON = { transform };
  } else if (!schema.options.toJSON.transform) {
    schema.options.toJSON.transform = transform;
  }
  
  // Add a toJSON method to the schema
  if (!schema.methods.toJSON) {
    schema.methods.toJSON = function (options) {
      const obj = this.toObject ? this.toObject(options) : this;
      
      // Apply the transform function
      if (typeof schema.options.toJSON.transform === 'function') {
        return schema.options.toJSON.transform(this, obj, options);
      }
      
      return obj;
    };
  }
};

export default toJSON;
