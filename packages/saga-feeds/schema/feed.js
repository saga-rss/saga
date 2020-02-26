const normalizeUrl = require('normalize-url')
const Promise = require('bluebird')
const { ApolloError } = require('apollo-server-express')

const { discoverFeeds } = require('../helpers/discovery')
const { processFeed } = require('../helpers/processFeed')
const logger = require('../helpers/logger').getLogger()

const feedById = async (source, { id }, context) => {
  const feed = await context.models.feed.findById(id)

  if (!feed) {
    throw new ApolloError(`feed not found`, 'NOT_FOUND')
  }

  return feed
}

const feedCreate = async (source, { feedUrl }, context) => {
  const normalizedFeedUrl = normalizeUrl(feedUrl)
  const discovered = await discoverFeeds(normalizedFeedUrl)

  if (!discovered || !discovered.feedUrls) {
    throw new ApolloError('no feed urls were found', 'NOT_FOUND', {
      feedUrl: normalizedFeedUrl,
    })
  }

  const feeds = await Promise.mapSeries(discovered.feedUrls, async feedUrl => {
    // check to see if feed exists
    const exists = await context.models.feed.findOne({ feedUrl: feedUrl.url })
    if (exists) {
      logger.debug(`This feed already exists, and does not need to be created`, {
        feedUrl,
      })
      return exists
    }

    const processed = await processFeed(feedUrl.url, true)

    if (!processed) {
      return {}
    }

    const { meta, posts } = processed

    const feedResponse = await context.models.feed.findOneAndUpdate(
      { identifier: meta.identifier },
      {
        ...meta,
        feedUrl: normalizeUrl(feedUrl.url),
      },
      {
        new: true,
        upsert: true,
      },
    )

    if (posts.length) {
      await Promise.map(posts, post => {
        return context.models.post.findOneAndUpdate(
          { identifier: post.identifier },
          {
            ...post,
            feed: feedResponse._id,
          },
          { new: true, upsert: true },
        )
      })
    }

    return feedResponse.detailView()
  })

  return feeds
}

const feedSearch = async (source, { id }, context) => {
  let feeds = []

  if (id) {
    const feed = await context.models.feed.findById(id)
    feeds.push(feed)
  } else {
    feeds = await context.models.feed.find()
  }

  return feeds
}

module.exports = {
  feedById,
  feedCreate,
  feedSearch,
}