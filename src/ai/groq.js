const fetch = require('node-fetch');
const Config = require('../config.json');

class Groq {
    run(promptText, codeSolidity) {
        return new Promise((resolve, reject) => {
            fetch(Config.groq.url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${Config.groq.apiKey}`
                },
                body: JSON.stringify({
                    model: Config.groq.model,
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
            })
            .then(async (response) => {
                const data = await response.json();
                if (data.error) {
                    reject(data.error.message);
                } else {
                    resolve({
                        model: Config.groq.model,
                        usage: {
                            prompt_tokens: data.usage.prompt_tokens,
                            completion_tokens: data.usage.completion_tokens,
                            total_tokens: data.usage.total_tokens
                        },
                        content: data.choices[0].message.content
                    });
                }
            })
            .catch(() => reject("Something wrong"));
        });
    }
}

module.exports = Groq;
