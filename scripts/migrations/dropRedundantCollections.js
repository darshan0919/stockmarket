require('dotenv').config();
const mongoose = require('mongoose');

async function dropCollections() {
  try {
    const mongoUrl = process.env.MONGO_URL || 'mongodb://localhost:27017/stock-screener';
    console.log(`Connecting to ${mongoUrl}`);
    await mongoose.connect(mongoUrl);
    console.log('Connected to MongoDB');

    const collections = ['pricehistories', 'fundamentals', 'financialstatements'];
    const existingCollections = await mongoose.connection.db.listCollections().toArray();
    const existingNames = existingCollections.map(c => c.name);

    for (const name of collections) {
      if (existingNames.includes(name)) {
        await mongoose.connection.db.dropCollection(name);
        console.log(`Dropped collection: ${name}`);
      } else {
        console.log(`Collection ${name} does not exist, skipping.`);
      }
    }
  } catch (err) {
    console.error('Error dropping collections:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

dropCollections();
