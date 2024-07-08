require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const axios = require('axios');
const uuid = require('uuid');
const cors = require('cors');
const { createUser, login, getUserById, getUserByEmail, updateUser, resetPassword, initiatePasswordReset, resetUserPassword } = require('./database/users');
const { upload, download } = require('./database/images');
const { calculate_tokens } = require('./utils/tokenizer');
const subscriptions = require('./database/subscriptions');
const user_subscriptions = require('./database/user_subscriptions');
const stripe_subscriptions = require('./utils/stripe_subscriptions');
const { createAgent, updateAgent, getAgentById, getAgentsPerLevel, getAllAgents, deleteAgent } = require('./database/agents');
const { createConversation, updateConversation, getConversationsByUserId, getConversation, deleteConversation, updateSystemContext } = require('./database/conversations');
const { sendResetPasswordEmail } = require('./utils/sendgrid');
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY });

const app = express();
const compression = require('compression');
app.use(compression());


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
    },
    pingInterval: 25000, // Adjusted ping interval to 25 seconds
    pingTimeout: 60000, // Adjusted ping timeout to 60 seconds
});


const ongoingMessageIds = new Map();
const starting_prompt = "You are a helpful assistant";

io.on('connection', (socket) => {
    console.log("New connection: ", socket.id);

    //socket.join('some-room');

    const sendMessageHandler = async ({ senderId, message, agent_id, conversation_id }) => {
        const newMessageId = `msg-${Date.now()}`;
        try {
            ongoingMessageIds.set(senderId, newMessageId);
            await reply(senderId, message, agent_id, conversation_id, socket);
        } catch (error) {
            console.error('Error handling sendMessage:', error);
            socket.emit('error', { message: 'Failed to process message.' });
        }
    };

    socket.on('sendMessage', sendMessageHandler);

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        // Cleanup if needed
        //socket.leave('some-room');
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

async function improvePrompt(user_message) {
    const context = [
        {
            role: 'system',
            content: "Act as an image description enhancer. Your job is to improve the description of the image. Example of your response: A Disney-style cartoon illustration of a mother otter and her baby otter. The mother otter has a loving, gentle expression with bright, friendly eyes and soft brown fur. The baby otter is smaller, with big, curious eyes and fluffy fur. They are floating together on their backs in a peaceful river surrounded by lush green plants and flowers. The scene is heartwarming and charming, capturing a tender moment between the mother and her child."
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

async function reply(user_id, msg, agent_id, conversation_id, socket) {
    if (!ongoingMessageIds.get(user_id)) {
        return;
    }

    const { data: user, error: user_error } = await getUserById(user_id);
    const { data: subscription, error: subscription_error } = await user_subscriptions.getSubscription(user_id);
    if ((!subscription || !subscription.is_active) && user.role != 'owner') {
        io.to(socket.id).emit('message', {
            id: ongoingMessageIds.get(user_id),
            senderId: user_id,
            text: 'You need an active subscription to continue using the service',
            complete: true,
            type: 'chat'
        });
        return;
    }

    if (subscription && subscription.credits <= 0 && user.role != 'owner') {
        io.to(socket.id).emit('message', {
            id: ongoingMessageIds.get(user_id),
            senderId: user_id,
            text: 'You need to purchase more credits to continue using the service',
            complete: true,
            type: 'chat'
        });
        return;
    }

    let total_tokens = 0;
    const user_tokens = calculate_tokens(msg);
    console.log("user_tokens", user_tokens);

    let context;
    let conversation;
    let conversation_name = "";
    let ai_message = "";
    let temperature = 0.5;
    let agent_prompt = "";
    console.log("conversation_id", conversation_id);

    if (agent_id) {
        const { data: agent, error: agent_error } = await getAgentById(agent_id);
        agent_prompt = agent.prompt;
        agent_type = agent.type;
        temperature = agent.temperature;
    }

    if (conversation_id) {
        const { data: conversation_data, error: conversation_error } = await getConversation(conversation_id);
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
    }

    const messageId = ongoingMessageIds.get(user_id);

    const response = await openai.chat.completions.create({
        messages: context,
        model: 'gpt-4o',
        temperature: temperature,
        stream: true,
        stream_options: { "include_usage": true }
    });

    let ai_tokens = 0;
    let fullMessage = '';
    for await (const chunk of response) {
        if (chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content) {
            fullMessage += chunk.choices[0].delta.content;
            io.to(socket.id).emit('message', {
                id: messageId,
                senderId: user_id,
                text: chunk.choices[0].delta.content,
                conversation_id: conversation_id,
                title: conversation_name,
                complete: false // Set to false for intermediate chunks
            });

            ai_tokens += calculate_tokens(chunk.choices[0].delta.content);
        }
    }

    // Emit a final message to indicate completion
    io.to(socket.id).emit('message', {
        id: messageId,
        senderId: user_id,
        text: fullMessage, // Ensure the full message is emitted with the final chunk
        conversation_id: conversation_id,
        title: conversation_name,
        complete: true // Set to true for the final chunk
    });

    console.log("ai_tokens", ai_tokens);
    total_tokens = user_tokens + ai_tokens;

    if (user.role != 'owner') {
        await user_subscriptions.updateCredits(user_id, subscription.credits - total_tokens);
    }

    context.push({ role: 'system', content: fullMessage });
    await updateConversation(conversation_id, conversation_name, context, user_id);
    ongoingMessageIds.delete(user_id);
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

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) {
        return res.status(400).json({ message: 'Password does not meet the required criteria.' });
    }

    const result = await createUser(email, password, first_name, last_name);

    if (result.error) {
        if (result.error.message.includes('already exists')) {
            return res.status(409).json({ message: result.error.message });
        }
        return res.status(500).json({ message: result.error.message });
    }

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

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password_1)) {
        return res.status(400).send({ 'message': 'Password does not meet the required criteria.' });
    }

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
app.post('/generate_image', authenticateJWT, async (req, res) => {
    const { msg, agent_id, conversation_id } = req.body;
    let conversation_name = "";

    const { data: conversation_data, error: conversation_error } = await getConversation(conversation_id);
    let context = conversation_data.context;

    if (context.length === 2) {
        conversation_name = await generateConversationTitle(msg);
    } else {
        conversation_name = conversation_data.name;
    }

    const { data: agent, error: agent_error } = await getAgentById(agent_id);
    context[0].content = agent.prompt;

    const new_prompt = await improvePrompt(agent.prompt + " " + msg);

    const image_to_generate = new_prompt;
    console.log("image_to_generate", image_to_generate);

    const response = await openai.images.generate({
        model: "dall-e-3",
        prompt: "I NEED to test how the tool works with extremely simple prompts. DO NOT add any detail, just use it AS-IS:" + image_to_generate,
        n: 1,
        size: "1024x1024",
    });

    console.log(response.data)

    let imageUrl = response.data[0].url;

    // Download image and convert to Base64
    try {
        const imageResponse = await axios({
            url: imageUrl,
            responseType: 'arraybuffer'
        });

        const imageBuffer = Buffer.from(imageResponse.data, 'binary');
        const base64String = imageBuffer.toString('base64');

        // Upload the image
        const messageId = ongoingMessageIds.get(req.userId);
        const randomId = uuid.v4().substring(0, 8);
        const { data, error } = await upload('images', base64String, randomId);
        console.log(data)
        if (error) {
            return res.status(500).json({ error: 'Failed to upload the image' });
        }

        // Update context with the image URL
        imageUrl = "https://urrfcikwbcocmanctoca.supabase.co/storage/v1/object/public/" + data.fullPath
        context.push({ role: 'user', content: msg });
        context.push({ role: 'system', content: imageUrl });
        await updateConversation(conversation_id, conversation_name, context, req.userId);

        return res.status(200).json({ response: imageUrl, conversation_name: conversation_name, messageId: messageId });
    } catch (error) {
        console.error('Error downloading or processing image:', error);
        return res.status(500).json({ error: 'Failed to download or process the image' });
    }
});

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

    const subscription_id = data.object.subscription;
    const customer_id = data.object.customer;
    const customer_email = data.object.customer_email;
    const price_id = data.object.lines ? data.object.lines.data[0].price.id : "";

    console.log("price_id", price_id);
    console.log("subscription_id", subscription_id);
    console.log("customer_id", customer_id);
    console.log("customer_email", customer_email);

    const { data: user, error: user_error } = await getUserByEmail(customer_email);
    const { data: current_subscription, error: current_subscription_error } = await subscriptions.getSubscriptionByPriceId(price_id);
    switch (eventType) {
        case 'invoice.paid':
            console.log("Subscription paid");
            const { data: current_user_subscription, error: current_user_subscription_error } = await user_subscriptions.getSubscription(user.id);
            if (current_user_subscription) {
                const new_credits = current_user_subscription.credits + current_subscription.credits;
                await user_subscriptions.updateSubscription(user.id, customer_id, true, new_credits);
                console.log("customer_id", customer_id);
                console.log("current_user_subscription", current_user_subscription);

            } else {
                const { data: subscription_result, error: subscription_error } = await user_subscriptions.createSubscription(subscription_id, customer_id, user.id, true, current_subscription.credits);
            }

            break;
        case 'invoice.payment_failed':
            console.log("Subscription not paid");
            break;
        case 'customer.subscription.deleted':
            console.log("Subscription canceled");
            await user_subscriptions.updateSubscription(user.id, customer_id, false);
            break;
        default:
    }

    res.sendStatus(200);
});

app.post('/start_subscription', authenticateJWT, async (req, res) => {
    const { price_id } = req.body;

    const { data: user, error: user_error } = await getUserById(req.userId);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    const { data: assign_result, error: assign_error } = await subscriptions.assignSubscription(req.userId, price_id);
    if (!assign_result) {
        return res.status(500).json({ error: 'Error assigning subscription' });
    }

    const url = await stripe_subscriptions.createSession(user.email, price_id);
    res.json({ response: url });
});

app.get('/get_stripe_portal', authenticateJWT, async (req, res) => {
    const { data: subscription, error: subscription_error } = await user_subscriptions.getSubscription(req.userId);
    const url = await stripe_subscriptions.createPortal(subscription.customer_id);

    res.json({ response: url });
});

/********************* Agents ***********/
app.post('/create_agent', authenticateJWT, onlyOwner, async (req, res) => {
    const { name, temperature, type, level, prompt } = req.body;

    if (!name || !type || !level || !prompt) {
        return res.status(400).json({ response: 'Params missing.' });
    }

    const { data, error } = await createAgent(name, temperature, type, level, prompt);
    return res.status(200).json({ response: data });
});

app.post('/update_agent', authenticateJWT, onlyOwner, async (req, res) => {
    const { agent_id, name, temperature, type, level, prompt } = req.body;

    if (!agent_id || !name || !type || !level || !prompt) {
        return res.status(400).json({ response: 'Params missing.' });
    }

    const { data, error } = await updateAgent(agent_id, name, temperature, type, level, prompt);
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

async function onlyActiveSubscription(req, res, next) {
    const { data: user, user_error } = await getUserById(req.userId);
    const { data: subscription, error: subscription_error } = await user_subscriptions.getSubscription(user.id);
    if (!subscription || !subscription.is_active) {
        return res.status(401).json({ error: 'Unauthorized access' });
    }

    next();
}
