class ConversationContext {
    constructor(prompt) {
        this.chatMessages = [
            { role: 'system', content: prompt },
        ];
    }

    async updateContextWithUserMessage(msg) {
        this.chatMessages.push({ role: 'user', content: msg });
    }

    async updateContextWithSystemMessage(msg) {
        this.chatMessages.push({ role: 'system', content: msg });
    }

    async getChatMessages() {
        return this.chatMessages;
    }
}

module.exports = ConversationContext;