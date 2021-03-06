const _ = require('lodash/fp')
const {
  mergeFieldsWith, propDo, setField, setFieldWith,
} = require('prairie')
const { isGt } = require('understory')
const handleRequest = require('./handlers')

const { addName, dailyDate } = require('./datasources/utils')

const StateAPI = require('./datasources/state')
const resolvers = require('./resolvers')
const typeDefs = require('./schema')

const dataSources = () => ({
  stateAPI: new StateAPI(),
})
const graphQLOptions = {
  dataSources,
  typeDefs,
  resolvers,
  baseEndpoint: '/graphql',
  playgroundEndpoint: '/playground',
  app: 'apollo',
  kvCache: false,
}

const sheets = {
  app: 'sheets',
  worksheetId: '18oVRrHj3c183mHmq3m89_163yuYltLNlOmPerQ18E8w',
  key: global.GOOGLE_API_KEY || _.get('process.env.GOOGLE_API_KEY', global),
}

// ROUTER

const redirectMap = new Map([
  ['/', 'http://covidtracking.com'],
  ['/states', { ...sheets, sheetName: 'States current' }],
  ['/states/daily', {
    ...sheets,
    fixItem: setFieldWith('dateChecked', 'date', dailyDate),
    sheetName: 'States daily 4 pm ET',
  }],
  ['/states/info', {
    ...sheets,
    sheetName: 'States',
    fixItem: addName,
  }],
  ['/us', { ...sheets, sheetName: 'US current' }],
  ['/us/daily', {
    ...sheets,
    sheetName: 'US daily 4 pm ET',
  }],
  ['/counties', { ...sheets, sheetName: 'Counties' }],
  ['/urls', {
    app: 'yaml',
    url: 'https://raw.githubusercontent.com/COVID19Tracking/covid-tracking/master/urls.yaml',
    multi: true,
    args: { json: true }, // Duplicate keys will override values rather than throwing an error.
  }],
  ['/screenshots', {
    app: 'xml',
    url: 'https://covid-data-archive.s3.us-east-2.amazonaws.com/',
    handleResult: _.flow(
      _.get('contents'),
      _.filter(_.overEvery([
        propDo('key', _.startsWith('state_screenshots/')),
        propDo('key', _.negate(_.includes('public'))),
        propDo('size', isGt(0)),
      ])),
      _.map(_.flow(
        mergeFieldsWith(
          'key',
          _.flow(
            _.split('/'),
            _.tail,
            _.zipObject(['state', 'filename']),
            setField(
              'url',
              ({ state, filename }) => `https://covidtracking.com/screenshots/${state}/${filename}`,
            ),
          ),
        ),
        _.omit(['storageClass', 'key', 'lastModified']),
      )),
      _.groupBy('state'),
    ),
  }],
  [graphQLOptions.baseEndpoint, graphQLOptions],
  // Playground.
  [graphQLOptions.playgroundEndpoint, { baseEndpoint: '/api/graphql', app: 'playground' }],
])

const options = {
  debug: true,
  forwardUnmatchedRequestsToOrigin: false,
}

function handler(request) {
  try {
    return handleRequest(redirectMap, request)
  } catch (err) {
    console.error(err)
    // Return the error stack as the response
    const result = options.debug ? (err.stack || err) : 'Error. Something went wrong.'
    return new Response(result, { status: 500 })
  }
}
addEventListener('fetch', (event) => {
  event.respondWith(handler(event.request))
})
