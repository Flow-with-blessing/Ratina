/**
 * stdout protection for the MCP stdio transport.
 *
 * Under `node server/mcpServer.js`, stdout IS the JSON-RPC 2.0 channel. Any
 * stray console.log from an imported module (for example the cache module
 * announcing seeded categories at import time, or the investigation engine
 * logging phase progress during a tools/call) is written into that channel
 * and corrupts the frame the client is parsing — Claude Desktop or Cursor
 * then fails to start the server, or drops a tool response mid-flight.
 *
 * Importing this module FIRST reroutes non-error console output to stderr.
 * Nothing is lost: stderr is where MCP clients collect server logs. Only
 * explicit process.stdout.write calls (the protocol frames themselves) reach
 * stdout after this.
 */

const forwardToStderr = (...args) => console.error(...args);

console.log = forwardToStderr;
console.info = forwardToStderr;
console.debug = forwardToStderr;
console.warn = forwardToStderr;
