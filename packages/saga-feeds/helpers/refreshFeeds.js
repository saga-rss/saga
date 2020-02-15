const got = require('got')

const Feed = require('../models/feed')
const { FeedStartQueueAdd, MetaStartQueueAdd } = require('../workers/queues')
const { shouldFeedPostsUpdate } = require('../util/rss')
const logger = require('./logger').getLogger()

const JOB_TYPE_FEED = 'feed'
const JOB_TYPE_META = 'meta'

const refreshFeeds = async (forceUpdate = false, jobType = JOB_TYPE_FEED) => {
  return Feed.find()
    .sort({ lastScrapedDate: 'asc' })
    .cursor()
    .eachAsync(async doc => {
      if (!doc.feedUrl) return Promise.resolve()

      try {
        const freshFeed = await got.get(doc.feedUrl)

        if (jobType === JOB_TYPE_FEED) {
          await scheduleFeedJob(doc, freshFeed, forceUpdate)
        } else if (jobType === JOB_TYPE_META) {
          await scheduleMetaJob(doc, freshFeed, forceUpdate)
        }

        return Promise.resolve(doc)
      } catch (error) {
        logger.error(`Problem updating feed`, { error, doc })

        await Feed.addScrapeFailure(doc._id)

        if (error.response && error.response.statusCode === 404) {
          // this feed doesn't exist
          await doc.delete()
        }

        return Promise.resolve()
      }
    })
    .catch(error => {
      logger.error(`Problem updating feed`, { error })
    })
}

const scheduleFeedJob = async (doc, freshFeed, forceUpdate) => {
  const willUpdate = shouldFeedPostsUpdate(doc.feedStaleDate, freshFeed.headers)

  if (forceUpdate || willUpdate) {
    await FeedStartQueueAdd(
      {
        type: 'Feed',
        feedId: doc._id,
        url: doc.feedUrl,
      },
      { removeOnComplete: true, removeOnFail: true },
    )
  }
}

const scheduleMetaJob = async (doc, freshFeed, forceUpdate) => {
  const willUpdate = shouldFeedPostsUpdate(doc.feedStaleDate, freshFeed.headers)

  if (forceUpdate || willUpdate) {
    await MetaStartQueueAdd(
      {
        type: 'Meta',
        feedId: doc._id,
        url: doc.url,
      },
      { removeOnComplete: true, removeOnFail: true },
    )
  }
}

module.exports = {
  JOB_TYPE_FEED,
  JOB_TYPE_META,
  refreshFeeds,
}
