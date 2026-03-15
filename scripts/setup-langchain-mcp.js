#!/usr/bin/env node

/**
 * LangChain MCP Server Configuration Script
 *
 * This script helps configure the LangChain MCP server for use with Claude Desktop or other MCP clients.
 *
 * Prerequisites:
 * 1. Install the package: pnpm add -D langchain-mcp
 * 2. Login to the service: npx langchain-mcp login
 *
 * After login, add this to your MCP configuration:
 */

const config = {
  mcpServers: {
    "langchain-mcp": {
      command: "node",
      args: [
        "c:\\Users\\Mohmed Aimen Raed\\elnos5a\\node_modules\\langchain-mcp\\dist\\index.js",
      ],
      env: {},
    },
  },
};

console.log("LangChain MCP Server Configuration:");
console.log(JSON.stringify(config, null, 2));

console.log("\nTo use this MCP server:");
console.log("1. First login: npx langchain-mcp login");
console.log("2. Add the above configuration to your MCP client");
console.log("3. Restart your MCP client");
console.log("\nAvailable tools after login:");
console.log("- search_docs: Search LangChain documentation");
console.log("- search_langchain_code: Search LangChain source code");
console.log("- search_langgraph_code: Search LangGraph source code");
console.log(
  "- langgraph_list_threads: List LangGraph threads (no login required)"
);
console.log("- langgraph_get_thread: Get thread details (no login required)");
