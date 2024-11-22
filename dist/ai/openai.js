"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAI = void 0;
const node_fetch_1 = __importDefault(require("node-fetch"));
const config_json_1 = __importDefault(require("../config.json"));
class OpenAI {
    run(promptText, codeSolidity) {
        return new Promise((resolve, reject) => {
            (0, node_fetch_1.default)(config_json_1.default.openai.url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${config_json_1.default.openai.apiKey}`
                },
                body: JSON.stringify({
                    model: config_json_1.default.openai.model,
                    messages: [
                        {
                            "role": "system",
                            "content": promptText
                        },
                        {
                            "role": "user",
                            "content": codeSolidity
                        }
                    ]
                })
            }).then(async (response) => {
                const data = await response.json();
                data.error ? reject(data.error.message) : resolve({
                    model: config_json_1.default.groq.model,
                    usage: {
                        prompt_tokens: data.usage.prompt_tokens,
                        completion_tokens: data.usage.completion_tokens,
                        total_tokens: data.usage.total_tokens
                    },
                    content: data.choices[0].message.content
                });
            }).catch(() => reject("Something wrong"));
        });
    }
}
exports.OpenAI = OpenAI;
