#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_KEY = process.env.TAVILY_API_KEY ?? "";

const server = new Server(
  { name: "tavily-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "tavily_search",
      description: "Search the web using Tavily. Returns results with titles, URLs, and content snippets. Use search_depth 'advanced' for harder queries.",
      inputSchema: {
        type: "object" as const,
        properties: {
          query: { type: "string", description: "Search query" },
          search_depth: { type: "string", enum: ["basic", "advanced"], description: "basic (fast) or advanced (thorough)" },
          max_results: { type: "number", description: "Number of results (1-10, default 5)" },
          include_answer: { type: "boolean", description: "Include a direct AI-generated answer" },
          include_domains: { type: "array", items: { type: "string" }, description: "Only search these domains" },
          exclude_domains: { type: "array", items: { type: "string" }, description: "Exclude these domains" },
        },
        required: ["query"],
      },
    },
    {
      name: "tavily_extract",
      description: "Extract the full text content from one or more URLs.",
      inputSchema: {
        type: "object" as const,
        properties: {
          urls: { type: "array", items: { type: "string" }, description: "URLs to extract content from" },
        },
        required: ["urls"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (!API_KEY) {
    return {
      content: [{ type: "text", text: "TAVILY_API_KEY environment variable is not set." }],
      isError: true,
    };
  }

  const { name, arguments: args } = request.params;

  if (name === "tavily_search") {
    const body = {
      api_key: API_KEY,
      query: args?.query as string,
      search_depth: (args?.search_depth as string) ?? "basic",
      max_results: (args?.max_results as number) ?? 5,
      include_answer: (args?.include_answer as boolean) ?? false,
      include_domains: (args?.include_domains as string[]) ?? [],
      exclude_domains: (args?.exclude_domains as string[]) ?? [],
    };

    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        content: [{ type: "text", text: `Tavily API error ${res.status}: ${text}` }],
        isError: true,
      };
    }

    const data = await res.json() as {
      answer?: string;
      results: { title: string; url: string; content: string; score: number }[];
    };

    const parts: string[] = [];
    if (data.answer) parts.push(`Answer: ${data.answer}\n`);
    for (const r of data.results) {
      parts.push(`[${r.title}](${r.url})\n${r.content}`);
    }

    return { content: [{ type: "text", text: parts.join("\n\n---\n\n") }] };
  }

  if (name === "tavily_extract") {
    const body = {
      api_key: API_KEY,
      urls: args?.urls as string[],
    };

    const res = await fetch("https://api.tavily.com/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        content: [{ type: "text", text: `Tavily API error ${res.status}: ${text}` }],
        isError: true,
      };
    }

    const data = await res.json() as {
      results: { url: string; raw_content: string }[];
    };

    const parts = data.results.map((r) => `## ${r.url}\n\n${r.raw_content}`);
    return { content: [{ type: "text", text: parts.join("\n\n---\n\n") }] };
  }

  return {
    content: [{ type: "text", text: `Unknown tool: ${name}` }],
    isError: true,
  };
});

await server.connect(new StdioServerTransport());
