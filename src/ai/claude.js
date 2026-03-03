const fetch = require('node-fetch');
const Config = require('../config.json');

class Claude {
    run(promptText, codeSolidity) {
        return new Promise((resolve, reject) => {
            fetch(Config.claude.url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": Config.claude.apiKey,
                    "anthropic-version": "2023-06-01"
                },
                body: JSON.stringify({
                    model: Config.claude.model,
                    max_tokens: 4096,
                    messages: [
                        {
                            "role": "user",
                            "content": `System: ${promptText}\n\nUser: ${codeSolidity}`
                        }
                    ]
                })
            })
            .then(async (response) => {
                const data = await response.json();
                if (data.error) {
                    reject(data.error.message);
                } else {
                    resolve({
                        model: Config.claude.model,
                        usage: {
                            prompt_tokens: data.usage.input_tokens,
                            completion_tokens: data.usage.output_tokens,
                            total_tokens: data.usage.input_tokens + data.usage.output_tokens
                        },
                        content: data.content[0].text
                    });
                }
            })
            .catch(() => reject("Something wrong"));
        });
    }
}

module.exports = Claude;
