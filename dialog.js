require('dotenv').config()

const OpenAI = require('openai')
const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY });


const createThread = async () => {
    const thread = await openai.beta.threads.create();
    return thread.id
}

const createMessage = async (thread_id, user_message) => {
    await openai.beta.threads.messages.create(
        thread_id,
        {
            role: "user",
            content: user_message
        }
    );

    const run = await openai.beta.threads.runs.create(
        thread_id,
        {
            assistant_id: process.env.ASSISTANT_ID,
        }
    );

    return run.id
}

const checkStatus = async (thread_id, run_id) => {
    const run = await openai.beta.threads.runs.retrieve(
        thread_id,
        run_id
    );
    return run.status
}

const retrieveMessage = async (thread_id) => {
    const messages = await openai.beta.threads.messages.list(
        thread_id
    );
    console.log(messages)
    return messages.body.data[0].content[0].text.value
}

module.exports = {
    createThread,
    createMessage,
    checkStatus,
    retrieveMessage
};