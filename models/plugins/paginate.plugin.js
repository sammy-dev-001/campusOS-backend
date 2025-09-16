/**
 * Pagination Plugin for Mongoose
 * @param {Schema} schema - Mongoose schema
 * @param {Object} options - Plugin options
 */
const paginate = (schema, options = {}) => {
  /**
   * Paginate documents
   * @param {Object} filter - Mongoose filter object
   * @param {Object} [options] - Query options
   * @param {string|Object} [options.sortBy] - Sorting criteria using format: sortField:(desc|asc). Multiple criteria can be separated by commas
   * @param {number} [options.limit] - Maximum number of results per page (default = 10)
   * @param {number} [options.page] - Current page (default = 1)
   * @param {string|string[]} [options.populate] - Populate paths
   * @param {boolean} [options.lean] - Return plain JavaScript objects instead of Mongoose documents
   * @param {Object} [options.select] - Fields to select (e.g., 'name email')
   * @param {Object} [options.projection] - Query projection
   * @returns {Promise<Object>}
   */
  schema.statics.paginate = async function (filter, options = {}) {
    // Set default options
    const sortBy = {};
    let sort = '';
    
    // Handle sorting
    if (options.sortBy) {
      const sortingCriteria = [];
      
      // Convert string to array of sort criteria
      const sortFields = typeof options.sortBy === 'string' 
        ? options.sortBy.split(',')
        : [];
      
      // Process each sort field
      sortFields.forEach((sortOption) => {
        const [key, order] = sortOption.split(':');
        sortBy[key.trim()] = order && order.toLowerCase() === 'desc' ? -1 : 1;
      });
      
      // Convert to MongoDB sort format
      sort = Object.entries(sortBy).map(([key, value]) => [key, value]);
    } else {
      // Default sort by createdAt descending
      sort = [['createdAt', -1]];
    }
    
    // Set pagination options with defaults
    const limit = options.limit && parseInt(options.limit, 10) > 0 
      ? parseInt(options.limit, 10) 
      : 10;
    const page = options.page && parseInt(options.page, 10) > 0 
      ? parseInt(options.page, 10) 
      : 1;
    const skip = (page - 1) * limit;
    
    // Build the query
    const countPromise = this.countDocuments(filter).exec();
    let query = this.find(filter);
    
    // Apply sorting
    if (sort.length > 0) {
      query = query.sort(sort);
    }
    
    // Apply pagination
    query = query.skip(skip).limit(limit);
    
    // Apply population if specified
    if (options.populate) {
      const populateOptions = Array.isArray(options.populate)
        ? options.populate
        : [options.populate];
      
      populateOptions.forEach((populateOption) => {
        query = query.populate(populateOption);
      });
    }
    
    // Apply field selection
    if (options.select) {
      query = query.select(options.select);
    }
    
    // Apply projection
    if (options.projection) {
      query = query.projection(options.projection);
    }
    
    // Execute query and convert to plain objects if lean is true
    const docsPromise = options.lean ? query.lean().exec() : query.exec();
    
    // Wait for both queries to complete
    const [totalResults, results] = await Promise.all([countPromise, docsPromise]);
    
    // Calculate pagination metadata
    const totalPages = Math.ceil(totalResults / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;
    
    // Prepare the result object
    const result = {
      data: results,
      meta: {
        total: totalResults,
        page,
        limit,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      },
    };
    
    // Add pagination links if requested
    if (options.links !== false) {
      const baseUrl = options.baseUrl || '';
      const queryParams = new URLSearchParams({
        ...options.queryParams,
        page,
        limit,
      });
      
      result.meta.links = {
        first: `${baseUrl}?${new URLSearchParams({ ...queryParams, page: 1, limit })}`,
        last: `${baseUrl}?${new URLSearchParams({ ...queryParams, page: totalPages, limit })}`,
        prev: hasPreviousPage 
          ? `${baseUrl}?${new URLSearchParams({ ...queryParams, page: page - 1, limit })}`
          : null,
        next: hasNextPage 
          ? `${baseUrl}?${new URLSearchParams({ ...queryParams, page: page + 1, limit })}`
          : null,
      };
    }
    
    return result;
  };
};

export default paginate;
