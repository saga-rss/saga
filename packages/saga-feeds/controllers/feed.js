const normalizeUrl = require('normalize-url')
const mongoose = require('mongoose')

const { wrapAsync } = require('./utils')
const { discoverFeeds } = require('../parsers/discovery')
const Feed = require('../models/feed')

const listFeeds = wrapAsync(async (req, res, next) => {
  const query = req.query || {}
  const feeds = await Feed.apiQuery(query)

  res.send(feeds)

  return next()
})

const createFeed = wrapAsync(async (req, res, next) => {
  const feedUrl = req.body.feedUrl

  if (!feedUrl) {
    return res.status(400)
      .json({ message: 'feedUrl required' })
  }

  const normalizedFeedUrl = normalizeUrl(feedUrl)
  const discovered = await discoverFeeds(normalizedFeedUrl)

  if (!discovered.feedUrls) {
    return res.status(404)
      .json({ message: 'no feed urls were found' })
  }

  const results = await Feed.createOrUpdateFeed(discovered)

  res.send(results.feeds)

  return next()
})

const getFeed = wrapAsync(async (req, res, next) => {
  const feedId = req.params.feedId
  const feed = await Feed.aggregate([
    { $match: { _id: { $in: [mongoose.Types.ObjectId(feedId)] } } },
    { $lookup: { from: 'post', localField: '_id', foreignField: 'feed', as: 'posts' } },
  ])

  if (!feed || !feed.length) {
    res.status(404)
    return res.json({ error: 'Feed does not exist.' })
  }

  res.send(feed[0])

  return next()
})

module.exports = {
  listFeeds,
  createFeed,
  getFeed,
}
