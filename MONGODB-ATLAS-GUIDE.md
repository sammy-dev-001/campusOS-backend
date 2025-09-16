# MongoDB Atlas Connection Troubleshooting Guide

## Common Issues and Solutions

### 1. Connection Timeout
**Symptoms**:
- Connection attempts time out
- Error messages about being unable to connect to any servers

**Solutions**:
1. **Check Internet Connection**:
   - Ensure you have a stable internet connection
   - Try pinging `cluster0.0ykmcom.mongodb.net` to check connectivity

2. **IP Whitelisting**:
   - Log in to your MongoDB Atlas dashboard
   - Go to Network Access under Security
   - Add your current IP address to the IP Access List
   - For development, you can temporarily allow access from anywhere (0.0.0.0/0) - NOT recommended for production

### 2. Authentication Errors
**Symptoms**:
- Authentication failed errors
- Invalid credentials messages

**Solutions**:
1. **Verify Credentials**:
   - Double-check your MongoDB Atlas username and password
   - Ensure the database user has the correct permissions

2. **Update Password**:
   - In MongoDB Atlas, go to Database Access under Security
   - Edit your database user and update the password if needed
   - Update the connection string with the new password

### 3. Connection String Issues
**Symptoms**:
- Malformed URI errors
- Protocol not supported

**Solutions**:
1. **Use Correct Connection String**:
   - Get the connection string from MongoDB Atlas:
     1. Click "Connect" on your cluster
     2. Choose "Connect your application"
     3. Select "Node.js" as the driver
     4. Copy the connection string

2. **Connection String Format**:
   ```
   mongodb+srv://<username>:<password>@cluster0.0ykmcom.mongodb.net/campusOS?retryWrites=true&w=majority
   ```

### 4. SSL/TLS Issues
**Symptoms**:
- SSL handshake failed
- TLS alert internal error

**Solutions**:
1. **Enable TLS/SSL**:
   - Ensure your connection string includes `?tls=true` or `?ssl=true`
   - For Mongoose, set `tls: true` in the connection options

2. **Update Node.js**:
   - Ensure you're using a recent version of Node.js (LTS recommended)
   - Some older versions have issues with modern TLS protocols

### 5. Firewall/Antivirus Blocking Connection
**Symptoms**:
- Connection refused
- Timeout when trying to connect

**Solutions**:
1. **Temporarily disable firewall/antivirus** to test the connection
2. **Add exceptions** for Node.js and MongoDB in your security software

## Testing the Connection

Use the following steps to test your MongoDB Atlas connection:

1. **Install MongoDB Shell**:
   ```bash
   npm install -g mongodb
   ```

2. **Test Connection with MongoDB Shell**:
   ```bash
   mongosh "mongodb+srv://<username>:<password>@cluster0.0ykmcom.mongodb.net/campusOS?retryWrites=true&w=majority"
   ```

3. **Test Connection with Node.js Script**:
   ```javascript
   const { MongoClient } = require('mongodb');
   
   const uri = 'YOUR_CONNECTION_STRING';
   const client = new MongoClient(uri);
   
   async function testConnection() {
     try {
       await client.connect();
       console.log('Connected to MongoDB!');
       const dbs = await client.db().admin().listDatabases();
       console.log('Databases:', dbs);
     } catch (err) {
       console.error('Connection error:', err);
     } finally {
       await client.close();
     }
   }
   
   testConnection();
   ```

## Next Steps

1. Once connected, update your `.env` file with the correct connection string
2. Test the connection using the provided test script
3. If issues persist, check the MongoDB Atlas status page for any ongoing incidents

## Support

If you're still experiencing issues, please provide:
1. The exact error message
2. Your Node.js version (`node -v`)
3. Your operating system
4. Whether you can connect using MongoDB Compass or the MongoDB Shell
