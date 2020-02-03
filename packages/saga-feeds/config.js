require('dotenv')
  .config()

module.exports = {
  app_name: 'saga-feeds',
  env: process.env.NODE_ENV,
  mongo: {
    uri: process.env.SAGA_MONGO_URI,
  },
}
