'use strict';

const { App } = require('homey');

class BusStopApp extends App {

  async onInit() {
    this.log('BusStop app initialized');
    this._departuresCache = {}; // keyed by "stopId:apiKey", TTL 60s (matches Trafiklab cache)
  }

}

module.exports = BusStopApp;
