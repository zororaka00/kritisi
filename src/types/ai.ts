export interface ResponseAi {
    model: string,
    usage: {
        prompt_tokens: number;      // number of tokens in the prompt
        completion_tokens: number;  // number of tokens in the completion
        total_tokens: number;       // total number of tokens (prompt + completion)
    },
    content: string
}

export interface ResultSecurityAi {
    high: { issue: string; suggestion: string, code_highlight: string }[];
    medium: { issue: string; suggestion: string, code_highlight: string }[];
    low: { issue: string; suggestion: string, code_highlight: string }[];
}