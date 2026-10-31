const adBlockService = require('../services/AdBlockService');

class ShieldsController {
  getStats() {
    return adBlockService.getStats();
  }

  recordAdBlocked(event, { count, source } = {}) {
    return adBlockService.recordAdBlocked(count, source);
  }

  resetStats() {
    return adBlockService.resetStats();
  }
}

module.exports = new ShieldsController();
