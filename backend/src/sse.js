const EventEmitter = require("events")

class SSEEmitter extends EventEmitter {}

const emitter = new SSEEmitter()

function emitRepairEvent(payload) {
  try {
    emitter.emit("repair", payload)
  } catch (e) {
    // swallow
  }
}

module.exports = {
  emitter,
  emitRepairEvent,
}
