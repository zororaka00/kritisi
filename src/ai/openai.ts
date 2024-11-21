import fetch from 'node-fetch';

import Config from '../config.json';
import { ResponseAi } from '../types';

export class OpenAI {
    run(promptText: string, codeSolidity: string): Promise<ResponseAi | string> {
        return new Promise((resolve, reject) => {
            fetch(Config.openai.url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${Config.openai.apiKey}`
                },
                body: JSON.stringify({
                    model: Config.openai.model,
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
            }).then(async response => {
                const data: any = await response.json();
                data.error ? reject(data.error.message) : resolve({
                    model: Config.groq.model,
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