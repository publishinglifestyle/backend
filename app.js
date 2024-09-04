require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const axios = require('axios');
const cron = require('node-cron');
const cors = require('cors');
const multer = require('multer');
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY });

const { createUser, login, getUserById, getUserByEmail, updateUser, resetPassword, initiatePasswordReset, resetUserPassword } = require('./database/users');
const { upload, download, downloadAndConvert, listImages, deleteImages } = require('./database/images');
const { calculate_tokens } = require('./utils/tokenizer');
const subscriptions = require('./database/subscriptions');
const user_subscriptions = require('./database/user_subscriptions');
const stripe_manager = require('./utils/stripe_manager');
const { createAgent, updateAgent, getAgentById, getAgentsPerLevel, getAllAgents, deleteAgent } = require('./database/agents');
const { createConversation, updateConversation, getConversationsByUserId, getConversation, deleteConversation, updateSystemContext } = require('./database/conversations');
const { sendResetPasswordEmail } = require('./utils/sendgrid');
const { generateImage, checkImageStatus, pressButton } = require('./utils/midjourney');
const { generateSudoku } = require('./games/sudokuGenerator');
const { generateCrossword } = require('./games/crosswordGenerator');
const { generateNurikabe } = require('./games/nurikabeGenerator');
const { generateWordSearch } = require('./games/wordsearchGenerator');
const { generateHangman } = require('./games/hangmanGenerator');
const { scrambleWords } = require('./games/wordScrumblerGenerator');
const { generateCryptogram } = require('./games/cryptogramGenerator');
const { generateMinefield } = require('./games/mineFinderGenerator');
const { webSearch } = require('./utils/serp');
const { createThread, createMessage, checkStatus, retrieveMessage } = require('./dialog')


const app = express();
const compression = require('compression');
app.use(compression());
const multer_upload = multer();


app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    next();
});

app.use(express.static('public'));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

const server = http.createServer(app);
const PORT = process.env.PORT || 8090;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

const io = socketIo(server, {
    cors: {
        origin: '*',
    }
});


const ongoingMessageIds = new Map();
const starting_prompt = "You are a helpful assistant";
const GAME_CREDITS = 1000;

io.on('connection', (socket) => {
    console.log("New connection: ", socket.id);

    const sendMessageHandler = ({ senderId, message, agent_id, conversation_id }) => {
        const newMessageId = `msg-${Date.now()}`;
        ongoingMessageIds.set(senderId, newMessageId);

        // Call reply without awaiting
        reply(senderId, message, agent_id, conversation_id, socket.id).catch(error => {
            console.error('Error handling sendMessage:', error);
            socket.emit('error', { message: 'Failed to process message.' });
        });
    };

    socket.on('sendMessage', sendMessageHandler);

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

async function generateConversationTitle(user_message) {
    const context = [
        { role: 'system', content: "You are a title generator. Your job is to generate a short title that captures the essence of the user message. Your title must be no longer than 5 words." },
        { role: 'user', content: "User message: " + user_message }
    ];
    const response = await openai.chat.completions.create({
        messages: context,
        model: 'gpt-4o',
        temperature: 0,
    });

    return response.choices[0].message.content;
}

async function improvePrompt(user_message, example) {
    const context = [
        {
            role: 'system',
            content: "Act as an image description enhancer. Your job is to improve the description of the image. Example of your response: " + example
        },
        {
            role: 'user',
            content: `Improve this image: "${user_message}".`
        }
    ];
    const response = await openai.chat.completions.create({
        messages: context,
        model: 'gpt-4o'
    });

    return response.choices[0].message.content;
}

async function translatePrompt(user_message) {
    const context = [
        {
            role: 'system',
            content: "Act as a professional translator. Your job is to tranlsate the user message to English. Your response must only contain the translation without any further texts or comments."
        },
        {
            role: 'user',
            content: `User message to translate in English: "${user_message}".`
        }
    ];
    const response = await openai.chat.completions.create({
        messages: context,
        model: 'gpt-4o'
    });

    return response.choices[0].message.content;
}

const handleStream = (response, user, user_id, subscription, socketId, messageId, conversation_id, conversation_name, context, user_tokens) => {
    context.pop();
    return new Promise((resolve, reject) => {
        let fullMessage = '';
        let ai_tokens = 0;
        let buffer = '';

        response.data.on('data', async (chunk) => {
            buffer += chunk.toString();
            let lines = buffer.split('\n');
            buffer = lines.pop(); // Keep the last partial line in the buffer

            for await (const line of lines) {
                if (line.trim() === '') continue; // Skip empty lines
                const message = line.replace(/^data: /, '');

                if (message === '[DONE]') {
                    const total_tokens = user_tokens + ai_tokens;

                    if (user.role !== 'owner') {
                        try {
                            await user_subscriptions.updateCredits(user_id, subscription.credits - total_tokens);
                        } catch (err) {
                            reject(err);
                            return;
                        }
                    }

                    if (io.sockets.sockets.get(socketId)) {
                        ai_tokens += calculate_tokens(fullMessage);

                        io.to(socketId).emit('message', {
                            id: messageId,
                            senderId: user_id,
                            text: "",
                            conversation_id: conversation_id,
                            title: conversation_name,
                            complete: true
                        });
                    }

                    context.push({ role: 'system', content: fullMessage });
                    try {
                        await updateConversation(conversation_id, conversation_name, context, user_id);
                    } catch (err) {
                        reject(err);
                        return;
                    }
                    resolve(fullMessage);
                    return;
                }

                let token;
                try {
                    token = JSON.parse(message)?.choices?.[0]?.delta?.content;
                } catch (error) {
                    console.error('Error parsing message', message);
                }

                if (token) {
                    fullMessage += token;

                    if (io.sockets.sockets.get(socketId)) {
                        io.to(socketId).emit('message', {
                            id: messageId,
                            senderId: user_id,
                            text: token,
                            conversation_id: conversation_id,
                            title: conversation_name,
                            complete: false // Set to false for intermediate chunks
                        });
                    }
                }
            }
        });

        response.data.on('end', () => {
            resolve(fullMessage);
        });

        response.data.on('error', reject);
    });
};

const availableTools = {
    webSearch
};

async function reply(user_id, msg, agent_id, conversation_id, socketId) {
    console.log("Processing message for user:", user_id);
    const { data: user } = await getUserById(user_id);
    const { data: subscription } = await user_subscriptions.getSubscription(user_id);

    if ((!subscription || !subscription.is_active) && user.role !== 'owner') {
        io.to(socketId).emit('message', {
            senderId: user_id,
            text: 'You need an active subscription to continue using the service. Go to My Profile to Start a Subscription',
            complete: true,
            type: 'chat'
        });
        return;
    }

    if (subscription && subscription.credits <= 0 && user.role !== 'owner') {
        io.to(socketId).emit('message', {
            senderId: user_id,
            text: 'You need to purchase more credits to continue using the service. Go to My Profile to Start a Subscription',
            complete: true,
            type: 'chat'
        });
        return;
    }

    const user_tokens = calculate_tokens(msg);
    let context;
    let conversation;
    let conversation_name = "";
    let temperature = 0.5;
    let agent_prompt = "";

    if (agent_id) {
        const { data: agent } = await getAgentById(agent_id);
        agent_prompt = agent.prompt;
        temperature = agent.temperature;
    }

    if (conversation_id) {
        const { data: conversation_data } = await getConversation(conversation_id);
        conversation = conversation_data;
        context = conversation.context;

        if (agent_id) {
            context[0].content = agent_prompt;
            await updateSystemContext(conversation_id, context);
        } else {
            context[0].content = starting_prompt;
            await updateSystemContext(conversation_id, context);
        }

        context.push({ role: 'user', content: msg });

        if (context.length === 2) {
            conversation_name = await generateConversationTitle(msg);
        } else {
            conversation_name = conversation.name;
        }

        const url = 'https://api.openai.com/v1/chat/completions';
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPEN_AI_KEY}`
        };

        const agent_response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: 'user', content: msg }],
            tools: [
                {
                    type: "function",
                    function: {
                        name: "webSearch",
                        description: "Search the web for information if the user asks specifically to browse the web",
                        parameters: {
                            type: "object",
                            properties: {
                                user_message: { type: "string" }
                            },
                            required: ["user_message"],
                        },
                    }
                }
            ],
        });
        console.log("agent_response", agent_response)
        const { finish_reason, message: agent_message } = agent_response.choices[0];
        if (finish_reason === "tool_calls" && agent_message.tool_calls) {
            const functionName = agent_message.tool_calls[0].function.name;
            const functionToCall = availableTools[functionName];
            const functionArgs = JSON.parse(agent_message.tool_calls[0].function.arguments);
            const functionArgsArr = Object.values(functionArgs);

            const functionResponse = await functionToCall.apply(null, functionArgsArr);
            context.push({
                role: "function",
                name: functionName,
                content: `The result of the last function was this: ${JSON.stringify(
                    functionResponse
                )}
                        `,
            });
        }

        const data = {
            model: 'gpt-4o',
            messages: context,
            temperature: temperature,
            stream: true
        };

        const messageId = ongoingMessageIds.get(user_id);

        axios.post(url, data, { headers, responseType: 'stream' })
            .then(response => {
                return handleStream(response, user, user_id, subscription, socketId, messageId, conversation_id, conversation_name, context, user_tokens);
            })
            .then(fullMessage => {
                //console.log("Full message received:", fullMessage);
            })
            .catch(error => {
                console.error('Error handling stream:', error);
                io.to(socketId).emit('error', { message: 'Failed to process message.' });
            });
    }
}

/********************* User Management ***********/
app.post('/sign_up', async (req, res) => {
    let { email, password, password_2, first_name, last_name } = req.body;

    if (!email || !password || !password_2 || !first_name || !last_name) {
        return res.status(400).json({ message: 'Some parameters are missing.' });
    }

    if (password !== password_2) {
        return res.status(400).json({ message: 'Passwords must be the same.' });
    }

    /*const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) {
        return res.status(400).json({ message: 'Password does not meet the required criteria.' });
    }*/

    const result = await createUser(email, password, first_name, last_name);

    /*if (result.error) {
        if (result.error.message.includes('already exists')) {
            return res.status(409).json({ message: result.error.message });
        }
        return res.status(500).json({ message: result.error.message });
    }*/

    const { token, error, code, response } = await login(email, password);
    res.status(201).json({ message: 'User created successfully.', token: token });
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ response: 'Email and password are required.' });
    }

    const { token, error, code, response } = await login(email, password);

    if (error) {
        console.error("Login error:", error);
        return res.status(500).json({ response: 'An error occurred during the login process.' });
    }

    if (code && response) {
        return res.status(code).json({ response: response });
    }

    if (token) {
        console.log("Token generated:", token);
        return res.json({ response: token });
    }

    return res.status(500).json({ response: 'An unexpected error occurred.' });
});

app.get('/get_user', authenticateJWT, async (req, res) => {
    const userId = req.userId;
    const { data: user, error } = await getUserById(userId);
    return res.status(200).json({ response: user });
});

app.post('/update_profile', authenticateJWT, async (req, res) => {
    const userId = req.userId;
    const { first_name, last_name, email } = req.body;

    if (!first_name || !last_name) {
        return res.status(400).json({ response: 'Params missing.' });
    }

    const { data, error } = await updateUser(userId, first_name, last_name, email);
    return res.status(200).json({ response: data });
});

app.post('/change_password', authenticateJWT, async (req, res) => {
    const { new_password, new_password_2 } = req.body;

    if (!new_password || !new_password_2) {
        return res.status(400).json({ response: 'Params missing.' });
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(new_password)) {
        return res.status(400).send({ 'message': 'Password does not meet the required criteria.' });
    }

    const { data, error } = await resetPassword(req.userId, new_password);
    return res.status(200).json({ response: true });
});

app.post('/initiate_password_reset', async (req, res) => {
    const email = req.body.email;

    const { data: user, error: user_error } = await getUserByEmail(email);
    if (!user) {
        return res.status(400).json({ 'message': 'User not found' });
    }

    const token = await initiatePasswordReset(email);
    console.log("Reset token", token);

    await sendResetPasswordEmail(email, token);
    res.json({ response: true });
});

app.post('/reset_password', async (req, res) => {
    const { token, password_1, password_2 } = req.body;

    if (!token || !password_1 || !password_2) {
        return res.status(400).json({ response: "Missing parameters" });
    }

    if (password_1 !== password_2) {
        return res.status(400).json({ response: "New passwords do not match" });
    }

    /*const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password_1)) {
        return res.status(400).send({ 'message': 'Password does not meet the required criteria.' });
    }*/

    const result = await resetUserPassword(token, password_1);
    res.json({ response: result });
});

app.post('/upload_profile_pic', authenticateJWT, async (req, res) => {
    const { base64String } = req.body;
    if (!base64String) {
        return res.status(400).send('No file data provided.');
    }

    const { data, error } = await upload('users', base64String, req.userId);
    if (error) {
        return res.status(500).send(error);
    }

    res.json({ response: true, data });
});

app.post('/upload_image', authenticateJWT, async (req, res) => {
    const { base64String } = req.body;
    if (!base64String) {
        return res.status(400).send('No file data provided.');
    }

    const { data, error } = await upload('temp_images', base64String, req.userId);
    if (error) {
        return res.status(500).send(error);
    }

    res.json({ response: true, url: "https://urrfcikwbcocmanctoca.supabase.co/storage/v1/object/public/" + data.fullPath });
});

app.get('/get_profile_pic', authenticateJWT, async (req, res) => {
    const { data, error } = await download('users', req.userId);

    if (error) {
        console.error(error);
        return res.status(500).json({ error: 'Failed to download profile pic' });
    }

    if (!data) {
        return res.status(404).json({ error: 'Profile pic not found' });
    }

    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader('Content-Type', data.type);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
});

/********************* Image Generation ***********/
app.post('/generate_image', authenticateJWT, onlySubscriber, async (req, res) => {
    const { msg, agent_id, conversation_id, save_user_prompt, prompt_commands } = req.body;

    let conversation_name = "";

    const { data: conversation_data, error: conversation_error } = await getConversation(conversation_id);
    let context = conversation_data.context;

    if (context.length === 1) {
        conversation_name = await generateConversationTitle(msg);
    } else {
        conversation_name = conversation_data.name;
    }

    const { data: agent, error: agent_error } = await getAgentById(agent_id);
    context[0].content = agent.prompt;
    const messageId = `msg-${Date.now()}`
    let response, imageUrl;

    const { data: subscription } = await user_subscriptions.getSubscription(req.userId);
    if (subscription) {
        if (subscription.credits >= 100000)
            await user_subscriptions.updateCredits(req.userId, subscription.credits - 100000);
        else
            return res.status(200).json({ error: 'You need to purchase more credits to continue using the service. Go to My Profile to Start a Subscription' });
    }

    if (agent.model == 'dall-e') {
        const new_prompt = await improvePrompt(msg, agent.prompt);

        const image_to_generate = new_prompt;
        console.log("image_to_generate", image_to_generate);

        response = await openai.images.generate({
            model: "dall-e-3",
            prompt: "I NEED to test how the tool works with extremely simple prompts. DO NOT add any detail, just use it AS-IS: " + image_to_generate,
            n: 1,
            size: "1024x1024",
        });

        imageUrl = response.data[0].url;

        // Download image and convert to Base64
        try {
            imageUrl = await downloadAndConvert(imageUrl)
            if (save_user_prompt)
                context.push({ role: 'user', content: msg });

            context.push({ role: 'system', content: imageUrl });
            await updateConversation(conversation_id, conversation_name, context, req.userId);

            return res.status(200).json({ response: imageUrl, conversation_name: conversation_name, messageId: messageId, image_ready: true });
        } catch (error) {
            console.error('Error downloading or processing image:', error);
            return res.status(500).json({ error: 'Failed to download or process the image' });
        }

    } else if (agent.model == 'midjourney') {
        const translated_message = await translatePrompt(msg);
        response = await generateImage(translated_message, prompt_commands);
        return res.status(200).json({ response: response, conversation_name: conversation_name, messageId: messageId, image_ready: false });
    }
});

/********************* Midjourney Specific ***********/
app.post('/check_image_status', authenticateJWT, async (req, res) => {
    const { msg, messageId, conversation_id, save_user_prompt } = req.body;
    const { data: conversation_data, error: conversation_error } = await getConversation(conversation_id);
    console.log("messageId", messageId)
    const response = await checkImageStatus(messageId);
    let imageUrl

    console.log("response", response)

    if (response.status == 'DONE') {
        let context = conversation_data.context;
        imageUrl = response.uri;

        if (save_user_prompt)
            context.push({ role: 'user', content: msg });
        context.push({ role: 'system', content: imageUrl, buttons: response.buttons, messageId: messageId });
        await updateConversation(conversation_id, conversation_data.name, context, req.userId);
    }
    return res.status(200).json({
        response: {
            messageId: messageId,
            status: response.status,
            imageUrl: imageUrl,
            conversation_name: conversation_data.name,
            buttons: response.buttons
        }
    });
})

app.post('/press_button', authenticateJWT, async (req, res) => {
    const { conversation_id, messageId, midjourneyMessageId, button } = req.body;
    const { data: conversation_data, error: conversation_error } = await getConversation(conversation_id);
    const response = await pressButton(midjourneyMessageId, button);
    console.log(response)
    return res.status(200).json({
        response: {
            messageId: response.messageId
        },
        conversation_name: conversation_data.name,
        image_ready: false
    });
})

/********************* Subscriptions ***********/
app.post('/create_subscription', authenticateJWT, onlyOwner, async (req, res) => {
    const { name, description, level, price_id, price, credits, type } = req.body;

    if (!name || !description || !level || !price_id || !price || !credits || !type) {
        return res.status(400).json({ response: 'Params missing.' });
    }

    const { data, error } = await subscriptions.createSubscription(name, description, level, price_id, price, credits, type);
    return res.status(200).json({ response: data });
});

app.post('/update_subscription', authenticateJWT, onlyOwner, async (req, res) => {
    const { subscription_id, name, description, level, price_id, price, credits, type } = req.body;

    if (!subscription_id || !name || !description || !level || !price_id || !price || !credits || !type) {
        return res.status(400).json({ response: 'Params missing.' });
    }

    const { data, error } = await subscriptions.updateSubscription(subscription_id, name, description, level, price_id, price, credits, type);
    return res.status(200).json({ response: data });
});

app.post('/delete_subscription', authenticateJWT, onlyOwner, async (req, res) => {
    const { subscription_id } = req.body;

    if (!subscription_id) {
        return res.status(400).json({ response: 'Params missing.' });
    }

    const { data, error } = await subscriptions.deleteSubscription(subscription_id);
    return res.status(200).json({ response: data });
});

app.get('/get_subscriptions', async (req, res) => {
    const { data, error } = await subscriptions.getSubscriptions();
    return res.status(200).json({ response: data });
});

app.get('/get_subscription', authenticateJWT, async (req, res) => {
    const { data, error } = await user_subscriptions.getSubscription(req.userId);
    return res.status(200).json({ response: data });
});

app.post('/stripe/webhook', async (req, res) => {
    let data = req.body.data;
    let eventType = req.body.type;

    console.log("eventType", eventType);
    console.log("data", data);

    const subscription_id = data.object.subscription;
    const customer_id = data.object.customer;
    const customer_email = data.object.customer_email;
    const price_id = data.object.lines ? data.object.lines.data[0].price.id : "";

    console.log("price_id", price_id);
    console.log("subscription_id", subscription_id);
    console.log("customer_id", customer_id);
    console.log("customer_email", customer_email);

    switch (eventType) {
        case 'checkout.session.completed':
            if (data.object.metadata && data.object.metadata.credits) {
                console.log("buy credits");
                const { data: user, error: user_error } = await getUserByEmail(customer_email);
                if (!user_error) {
                    const { data: subscription } = await user_subscriptions.getSubscription(user.id);
                    await user_subscriptions.updateCredits(user.id, subscription.credits + parseInt(data.object.metadata.credits));
                    console.log(`Added ${data.object.metadata.credits} credits to user ${user.id}`);
                } else {
                    console.error("User not found or error occurred:", user_error);
                }
            }
            break
        case 'invoice.paid':

            const { data: user, error: user_error } = await getUserByEmail(customer_email);
            const { data: current_subscription, error: current_subscription_error } = await subscriptions.getSubscriptionByPriceId(price_id);
            const { data: current_user_subscription, error: current_user_subscription_error } = await user_subscriptions.getSubscription(user.id);
            if (current_user_subscription) {
                const new_credits = current_user_subscription.credits + current_subscription.credits;
                await user_subscriptions.updateSubscription(user.id, customer_id, true, new_credits);
                console.log("customer_id", customer_id);
                console.log("current_user_subscription", current_user_subscription);

            } else {
                const { data: subscription_result, error: subscription_error } = await user_subscriptions.createSubscription(subscription_id, customer_id, user.id, true, current_subscription.credits);
            }

            console.log("Subscription paid");


            break;
        case 'invoice.payment_failed' || 'customer.subscription.deleted':
            const { data: current_subscription_stripe, error: current_subscription_stripe_error } = await user_subscriptions.getSubscriptionByStripeCustomerId(customer_id);
            console.log("current_subscription_stripe", current_subscription_stripe)
            console.log("current_subscription_stripe_error", current_subscription_stripe_error)
            if (current_subscription_stripe)
                await user_subscriptions.deleteSubscription(current_subscription_stripe.id);
            console.log("Subscription canceled");
            break;
        default:
    }

    res.sendStatus(200);
});

app.post('/start_subscription', authenticateJWT, async (req, res) => {
    const { price_id } = req.body;
    //const price_id = "price_1Pp8Fq2MV6hKm3ONPm3zl9uv"

    const { data: user, error: user_error } = await getUserById(req.userId);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    const { data: assign_result, error: assign_error } = await subscriptions.assignSubscription(req.userId, price_id);
    if (!assign_result) {
        return res.status(500).json({ error: 'Error assigning subscription' });
    }

    const url = await stripe_manager.createSession(user.email, price_id);
    res.json({ response: url });
});

app.get('/get_stripe_portal', authenticateJWT, async (req, res) => {
    const { data: subscription, error: subscription_error } = await user_subscriptions.getSubscription(req.userId);
    const url = await stripe_manager.createPortal(subscription.customer_id);

    res.json({ response: url });
});

/********************* Agents ***********/
app.post('/create_agent', authenticateJWT, onlyOwner, async (req, res) => {
    const { name, temperature, type, level, prompt, model, n_buttons, buttons } = req.body;

    if (!name || !type || !level || !prompt || !buttons) {
        return res.status(400).json({ response: 'Params missing.' });
    }

    const { data, error } = await createAgent(name, temperature, type, level, prompt, model, n_buttons, buttons);
    return res.status(200).json({ response: data });
});

app.post('/update_agent', authenticateJWT, onlyOwner, async (req, res) => {
    const { agent_id, name, temperature, type, level, prompt, model, n_buttons, buttons } = req.body;

    if (!agent_id || !name || !type || !level || !prompt || !buttons) {
        return res.status(400).json({ response: 'Params missing.' });
    }

    const { data, error } = await updateAgent(agent_id, name, temperature, type, level, prompt, model, n_buttons, buttons);
    return res.status(200).json({ response: data });
});

app.post('/get_agent', authenticateJWT, async (req, res) => {
    const { agent_id } = req.body;

    if (!agent_id) {
        return res.status(400).json({ response: 'Params missing.' });
    }

    const { data, error } = await getAgentById(agent_id);
    return res.status(200).json({ response: data });
});

app.get('/get_agents_per_level', authenticateJWT, async (req, res) => {
    const { data: user, error: user_error } = await getUserById(req.userId);

    const level = user.role == 'owner' ? 3 : user.subscription_level;
    const { data, error } = await getAgentsPerLevel(level);
    return res.status(200).json({ response: data });
});

app.get('/get_all_agents', async (req, res) => {
    const { data, error } = await getAllAgents();
    return res.status(200).json({ response: data });
});

app.post('/delete_agent', authenticateJWT, onlyOwner, async (req, res) => {
    const { agent_id } = req.body;

    if (!agent_id) {
        return res.status(400).json({ response: 'Params missing.' });
    }

    const { data, error } = await deleteAgent(agent_id);
    return res.status(200).json({ response: data });
});

/********************* Conversations ***********/
app.get('/create_conversation', authenticateJWT, async (req, res) => {
    ongoingMessageIds.set(req.userId, `msg-${Date.now()}`);

    const context = [
        { role: 'system', content: starting_prompt },
    ];

    const { data, error } = await createConversation('Default', context, req.userId);
    return res.status(200).json({ response: data });
});

app.get('/get_conversations', authenticateJWT, async (req, res) => {
    const { data, error } = await getConversationsByUserId(req.userId);
    return res.status(200).json({ response: data });
});

app.get('/get_conversation', authenticateJWT, async (req, res) => {
    const { conversation_id } = req.query;

    if (!conversation_id) {
        return res.status(400).json({ response: 'Params missing.' });
    }

    const { data, error } = await getConversation(conversation_id);
    return res.status(200).json({ response: data });
});

app.post('/delete_conversation', authenticateJWT, async (req, res) => {
    const { conversation_id } = req.body;

    if (!conversation_id) {
        return res.status(400).json({ response: 'Params missing.' });
    }

    const { data, error } = await deleteConversation(conversation_id);
    return res.status(200).json({ response: data });
});

app.post('/change_conversation_name', authenticateJWT, async (req, res) => {
    const { conversation_id, name } = req.body;

    if (!conversation_id || !name) {
        return res.status(400).json({ response: 'Params missing.' });
    }

    const { data: conversation, error: conversation_error } = await getConversation(conversation_id);
    const { data, error } = await updateConversation(conversation_id, name, conversation.content, req.userId);
    return res.status(200).json({ response: data });
})

/********************* Games Management ***********/
app.post('/generate_sudoku', authenticateJWT, onlySubscriber, async (req, res) => {
    const { difficulty, num_puzzles } = req.body;

    const { data: subscription } = await user_subscriptions.getSubscription(req.userId);
    if (subscription.credits >= GAME_CREDITS)
        await user_subscriptions.updateCredits(req.userId, subscription.credits - GAME_CREDITS);
    else
        return res.status(200).json({ error: 'You need to purchase more credits to continue using the service.' });

    const sudoku = generateSudoku(difficulty, num_puzzles);
    return res.status(200).json({ response: sudoku });
})

app.post('/generate_crossword', authenticateJWT, onlySubscriber, async (req, res) => {
    const { words, clues, words_per_puzzle, num_puzzles } = req.body;

    try {
        const { data: subscription } = await user_subscriptions.getSubscription(req.userId);
        if (subscription.credits >= GAME_CREDITS)
            await user_subscriptions.updateCredits(req.userId, subscription.credits - GAME_CREDITS);
        else
            return res.status(200).json({ error: 'You need to purchase more credits to continue using the service.' });

        const crossword = await generateCrossword(words, clues, words_per_puzzle, num_puzzles);

        // Check if the response contains an error
        if (crossword.error) {
            return res.status(400).json({ error: crossword.error });
        }

        return res.status(200).json({ response: crossword });
    } catch (error) {
        console.error("Unexpected error:", error);
        return res.status(500).json({ error: "An unexpected error occurred." });
    }
});


/*app.post('/generate_nurikabe', authenticateJWT, onlySubscriber, async (req, res) => {
    const { size = 5 } = req.body;

    const puzzle = await generateNurikabe(size);
    return res.status(200).json({ response: puzzle });
});*/

app.post('/generate_wordsearch', authenticateJWT, onlySubscriber, async (req, res) => {
    const { words, num_puzzles, backwards_probability } = req.body;

    const { data: subscription } = await user_subscriptions.getSubscription(req.userId);
    if (subscription.credits >= GAME_CREDITS)
        await user_subscriptions.updateCredits(req.userId, subscription.credits - GAME_CREDITS);
    else
        return res.status(200).json({ error: 'You need to purchase more credits to continue using the service.' });

    const puzzle = await generateWordSearch(words, num_puzzles, backwards_probability);
    return res.status(200).json({ response: puzzle });
})

app.post('/generate_hangman', authenticateJWT, onlySubscriber, async (req, res) => {
    const { words } = req.body;

    const { data: subscription } = await user_subscriptions.getSubscription(req.userId);
    if (subscription.credits >= GAME_CREDITS)
        await user_subscriptions.updateCredits(req.userId, subscription.credits - GAME_CREDITS);
    else
        return res.status(200).json({ error: 'You need to purchase more credits to continue using the service.' });

    const puzzle = generateHangman(words);
    return res.status(200).json({ response: puzzle });
})

app.post('/scramble_word', authenticateJWT, onlySubscriber, async (req, res) => {
    const { words } = req.body;

    const { data: subscription } = await user_subscriptions.getSubscription(req.userId);
    if (subscription.credits >= GAME_CREDITS)
        await user_subscriptions.updateCredits(req.userId, subscription.credits - GAME_CREDITS);
    else
        return res.status(200).json({ error: 'You need to purchase more credits to continue using the service.' });

    const scrambled = scrambleWords(words);
    return res.status(200).json({ response: scrambled });
})

app.post('/generate_cryptogram', authenticateJWT, onlySubscriber, async (req, res) => {
    const { phrases } = req.body;

    const { data: subscription } = await user_subscriptions.getSubscription(req.userId);
    if (subscription.credits >= GAME_CREDITS)
        await user_subscriptions.updateCredits(req.userId, subscription.credits - GAME_CREDITS);
    else
        return res.status(200).json({ error: 'You need to purchase more credits to continue using the service.' });

    const puzzle = generateCryptogram(phrases);
    return res.status(200).json({ response: puzzle });
})

app.get('/generate_maze', authenticateJWT, onlySubscriber, async (req, res) => {
    const { data: subscription } = await user_subscriptions.getSubscription(req.userId);
    if (subscription.credits >= GAME_CREDITS * 10) {
        await user_subscriptions.updateCredits(req.userId, subscription.credits - (GAME_CREDITS * 10));
        return res.status(200).json({ allowed: true });
    } else
        return res.status(200).json({ allowed: false, error: 'You need to purchase more credits to continue using the service.' });
})

app.post('/generate_minesweeper', authenticateJWT, onlySubscriber, async (req, res) => {
    const { width, height, mines, num_puzzles } = req.body;

    const { data: subscription } = await user_subscriptions.getSubscription(req.userId);
    if (subscription.credits >= GAME_CREDITS)
        await user_subscriptions.updateCredits(req.userId, subscription.credits - GAME_CREDITS);
    else
        return res.status(200).json({ error: 'You need to purchase more credits to continue using the service.' });

    const minesweeper = generateMinefield(width, height, mines, num_puzzles);
    return res.status(200).json({ response: minesweeper });
})

/* Credits Management */
app.post('/purchase_credits', authenticateJWT, async (req, res) => {
    const { package_number } = req.body;
    const { data: user } = await getUserById(req.userId);
    const url = await stripe_manager.buyCredits(package_number, user.email);
    res.json({ response: url });
})

/* Chat Assistant Management */
app.get('/start_conversation', async (req, res) => {
    const thread_id = await createThread()
    res.status(200).json({ thread_id: thread_id })
})

app.post('/retrieve_message', multer_upload.none(), async (req, res) => {
    if (!req.body.thread_id) {
        return res.status(404).json({ error: 'Missing thread_id paramater' })
    }

    const message = await retrieveMessage(req.body.thread_id)
    res.status(200).json({ message: message })
})

app.post('/check_status', multer_upload.none(), async (req, res) => {
    const { thread_id, run_id } = req.body
    if (!thread_id || !run_id) {
        return res.status(404).json({ error: 'Missing paramaters' })
    }

    const status = await checkStatus(thread_id, run_id)
    console.log("status", status)
    res.status(200).json({ status: status })
})

app.post('/new_message', multer_upload.none(), async (req, res) => {
    const { thread_id, message } = req.body

    if (!thread_id || !message) {
        return res.status(404).json({ error: 'Missing paramaters' })
    }

    const run_id = await createMessage(thread_id, message)
    res.status(200).json({ run_id: run_id })
})

/* Utils */
function authenticateJWT(req, res, next) {
    const token = req.headers.authorization;

    if (!token) {
        return res.status(401).send('Access Token Required');
    }

    jwt.verify(token, process.env.SECRET, (err, user) => {
        if (err) {
            return res.status(403).send('Invalid Access Token');
        }
        req.userId = user.id;
        next();
    });
}

async function onlyOwner(req, res, next) {
    const userId = req.userId;
    const { data: user, user_error } = await getUserById(userId);
    if (user.role != 'owner') {
        return res.status(401).json({ error: 'Unauthorized access' });
    }

    next();
}

async function onlySubscriber(req, res, next) {
    const { data: user } = await getUserById(req.userId);
    const { data: subscription } = await user_subscriptions.getSubscription(req.userId);

    if ((!subscription || !subscription.is_active) && user.role !== 'owner') {
        return res.status(200).json({ error: 'You need an active subscription to continue using the service. Go to My Profile to Start a Subscription' });
    }

    if (subscription && subscription.credits <= 0 && user.role !== 'owner') {
        return res.status(200).json({ error: 'You need to purchase more credits to continue using the service. Go to My Profile to Start a Subscription' });
    }

    next();
}

const remove_images = async () => {
    try {
        console.log('Task is running. Executed every hour.');

        // Define the image types to process
        const imageTypes = ['images', 'temp_images'];

        for (const type of imageTypes) {
            // Fetch the images
            const { data, error } = await listImages(type);
            if (error) {
                throw new Error(`Error fetching ${type}: ${error.message}`);
            }

            // Calculate the cutoff time (24 hours ago)
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

            // Filter images that are older than 24 hours
            const filteredData = data.filter(image => new Date(image.created_at) <= twentyFourHoursAgo);
            const fileNames = filteredData.map(image => image.name);

            // Delete the filtered images
            const { data: deleteData, deleteError } = await deleteImages(fileNames, type);
            if (deleteError) {
                throw new Error(`Error deleting ${type}: ${deleteError.message}`);
            }

            console.log(`${type.charAt(0).toUpperCase() + type.slice(1)} successfully deleted:`, deleteData);
        }
    } catch (err) {
        console.error('Error occurred during image removal:', err);
    }
};

// Schedule the cron job to run every hour
cron.schedule('0 * * * *', remove_images);