import { ChatAnthropic } from "@langchain/anthropic";

const model = new ChatAnthropic({
    model: "claude-haiku-4-5",
    apiKey: process.env.CLAUDE_API_KEY,
});

export default model;