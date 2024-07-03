/*
* 2 times your costs
* 1 token - $0.000005 (input) - $0.000015 (sales)
* 1 token - $0.000015 (output)- $0.000045 (sales)
* 1 image - $0.003825 - $0.011475 (sales)
*/

require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const cors = require('cors');
const {
    createUser,
    login,
    getUserById,
    getUserByEmail,
    updateUser,
    uploadProfilePic,
    downloadProfilePic,
    resetPassword,
    initiatePasswordReset,
    resetUserPassword
} = require('./database/users');
const { calculate_tokens } = require('./utils/tokenizer');
const subscriptions = require('./database/subscriptions')
const user_subscriptions = require('./database/user_subscriptions')
const stripe_subscriptions = require('./utils/stripe_subscriptions')
const { createAgent, updateAgent, getAgentById, getAgentsPerLevel, getAllAgents, deleteAgent } = require('./database/agents');
const { createConversation, updateConversation, getConversationsByUserId, getConversation, deleteConversation, updateSystemContext } = require('./database/conversations');
const { sendResetPasswordEmail } = require('./utils/sendgrid')
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY });

const app = express();
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    next();
});

app.use(express.static('public'));
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: '*',
    }
});

const onlineUsers = new Map();
const starting_prompt = "You are a helpful assistant"

io.on('connection', (socket) => {
    console.log("New connection: ", socket.id);

    socket.on('sendMessage', async ({ senderId, message, agent_id, conversation_id }) => {
        const newMessageId = `msg-${Date.now()}`;
        try {
            ongoingMessageIds.set(senderId, newMessageId);
            await reply(senderId, message, agent_id, conversation_id, socket);
        } catch (error) {
            console.error('Error handling sendMessage:', error);

        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        onlineUsers.delete(socket.id);
    });
});

const PORT = process.env.PORT || 8090;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

const ongoingMessageIds = new Map();

async function generateConversationTitle(user_message) {
    const context = [
        { role: 'system', content: "You are a title generator. Your job is to generate a short title that capture the essence of the user message. Your title must be long no more than 5 words." },
        { role: 'user', content: "User message: " + user_message }
    ]
    const response = await openai.chat.completions.create({
        messages: context,
        model: 'gpt-4o',
        temperature: 0,
    });

    return response.choices[0].message.content
}

async function improvePrompt(user_message) {
    const context = [
        {
            role: 'system',
            content: "Act as an image description enhancer. Your job is to improve the description of the image."
        },
        {
            role: 'user',
            content: `Improve this description: "${user_message}".`
        }
    ];
    const response = await openai.chat.completions.create({
        messages: context,
        model: 'gpt-4o',
    });

    return response.choices[0].message.content;
}



async function reply(user_id, msg, agent_id, conversation_id, socket) {
    const { data: user, error: user_error } = await getUserById(user_id)
    const { data: subscription, error: subscription_error } = await user_subscriptions.getSubscription(user_id)
    if ((!subscription || !subscription.is_active) && user.role != 'owner') {
        io.to(socket.id).emit('message', {
            id: ongoingMessageIds.get(user_id),
            senderId: user_id,
            text: 'You need an active subscription to continue using the service',
            complete: true,
            type: 'chat'
        });
        return
    }

    if (subscription && subscription.credits <= 0 && user.role != 'owner') {
        io.to(socket.id).emit('message', {
            id: ongoingMessageIds.get(user_id),
            senderId: user_id,
            text: 'You need to purchase more credits to continue using the service',
            complete: true,
            type: 'chat'
        });
        return
    }

    let total_tokens = 0;
    const user_tokens = calculate_tokens(msg);
    console.log("user_tokens", user_tokens)

    let context
    let conversation
    let conversation_name = ""
    let ai_message = ""
    let temperature = 0.5
    let agent_prompt = ""
    let agent_type = ""
    console.log("conversation_id", conversation_id)

    if (agent_id) {
        const { data: agent, error: agent_error } = await getAgentById(agent_id)
        agent_prompt = agent.prompt
        agent_type = agent.type
    }

    if (conversation_id) {
        const { data: conversation_data, error: conversation_error } = await getConversation(conversation_id)
        conversation = conversation_data
        context = conversation.context

        if (agent_id) {
            context[0].content = agent_prompt
            await updateSystemContext(conversation_id, context)
        } else {
            context[0].content = starting_prompt
            await updateSystemContext(conversation_id, context)
        }

        context.push({ role: 'user', content: msg });

        if (context.length == 2) {
            conversation_name = await generateConversationTitle(msg)
        } else {
            conversation_name = conversation.name
        }
    }

    // Fetch the ongoing message ID
    const messageId = ongoingMessageIds.get(user_id);

    console.log("context", context)
    if (agent_type == 'image') {
        console.log('Image');
        const new_prompt = await improvePrompt(msg)
        const image_to_generate = new_prompt + "\n" + agent_prompt;
        console.log("image_to_generate", image_to_generate)

        const response = await openai.images.generate({
            model: "dall-e-3",
            prompt: image_to_generate,
            n: 1,
            size: "1024x1024",
        });

        io.to(socket.id).emit('message', {
            id: messageId,
            senderId: user_id,
            text: response.data[0].url,
            conversation_id: conversation_id,
            type: 'image',
            title: conversation_name
        });

        context.push({ role: 'system', content: response.data[0].url });
        await updateConversation(conversation_id, conversation_name, context, user_id)

    } else {
        const response = await openai.chat.completions.create({
            messages: context,
            model: 'gpt-4o',
            temperature: temperature,
            stream: true
        });

        let ai_tokens = 0
        for await (const chunk of response) {
            if (chunk.choices[0].delta.content) {
                io.to(socket.id).emit('message', {
                    id: messageId,
                    senderId: user_id,
                    text: chunk.choices[0].delta.content,
                    conversation_id: conversation_id,
                    type: 'chat',
                    title: conversation_name
                });

                ai_tokens += calculate_tokens(chunk.choices[0].delta.content);
                ai_message += chunk.choices[0].delta.content
            }
        }

        console.log("ai_tokens", ai_tokens)
        total_tokens = user_tokens + ai_tokens

        if (user.role != 'owner') {
            await user_subscriptions.updateCredits(user_id, subscription.credits - total_tokens)
        }

        // If the message is complete, clear the ID from the map
        context.push({ role: 'system', content: ai_message });
        await updateConversation(conversation_id, conversation_name, context, user_id)
        ongoingMessageIds.delete(user_id);
    }
}

/********************* User Management ***********/
app.post('/sign_up', async (req, res) => {
    let { email, password, password_2, first_name, last_name } = req.body;

    // Check for missing parameters
    if (!email || !password || !password_2 || !first_name || !last_name) {
        return res.status(400).json({ message: 'Some parameters are missing.' });
    }

    // Ensure passwords match
    if (password !== password_2) {
        return res.status(400).json({ message: 'Passwords must be the same.' });
    }

    // Validate password strength
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) {
        return res.status(400).json({ message: 'Password does not meet the required criteria.' });
    }

    const result = await createUser(email, password, first_name, last_name);

    // Check if there was an error creating the user
    if (result.error) {
        if (result.error.message.includes('already exists')) {
            return res.status(409).json({ message: result.error.message });
        }
        // For other types of errors, you might want to return a generic 500 Internal Server Error status
        return res.status(500).json({ message: result.error.message });
    }

    const { token, error, code, response } = await login(email, password);

    // User created successfully
    res.status(201).json({ message: 'User created successfully.', token: token });
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ response: 'Email and password are required.' });
    }

    const { token, error, code, response } = await login(email, password);

    // If there was an error in the login process, handle it
    if (error) {
        console.error("Login error:", error);
        // Optional: Adjust the status code and error message as needed
        return res.status(500).json({ response: 'An error occurred during the login process.' });
    }

    // Handle custom response codes and messages from the login function
    if (code && response) {
        return res.status(code).json({ response: response });
    }

    // If a token was successfully generated, return it
    if (token) {
        console.log("Token generated:", token);
        return res.json({ response: token });
    }

    // Catch-all for any other cases not explicitly handled above
    return res.status(500).json({ response: 'An unexpected error occurred.' });
});

app.get('/get_user', authenticateJWT, async (req, res) => {
    const userId = req.userId;
    const { data: user, error } = await getUserById(userId)
    return res.status(200).json({ response: user });
});

app.post('/update_profile', authenticateJWT, async (req, res) => {
    const userId = req.userId;
    const { first_name, last_name, email } = req.body;

    if (!first_name || !last_name) {
        return res.status(400).json({ response: 'Params missing.' });
    }

    const { data, error } = await updateUser(userId, first_name, last_name, email)
    return res.status(200).json({ response: data });
})

app.post('/change_password', authenticateJWT, async (req, res) => {
    const { new_password, new_password_2 } = req.body;

    if (!new_password || !new_password_2) {
        return res.status(400).json({ response: 'Params missing.' });
    }

    // Password validation
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(new_password)) {
        return res.status(400).send({ 'message': 'Password does not meet the required criteria.' });
    }

    const { data, error } = await resetPassword(req.userId, new_password)
    return res.status(200).json({ response: true });
});

app.post('/initiate_password_reset', async (req, res) => {
    const email = req.body.email

    const { data: user, error: user_error } = await getUserByEmail(email)
    if (!user) {
        return res.status(400).json({ 'message': 'User not found' })
    }

    const token = await initiatePasswordReset(email)
    console.log("Reset token", token)

    await sendResetPasswordEmail(email, token)
    res.json({ response: true });
});

app.post('/reset_password', async (req, res) => {
    const { token, password_1, password_2 } = req.body

    // Check for missing parameters
    if (!token || !password_1 || !password_2) {
        return res.status(400).json({ response: "Missing parameters" });
    }

    // Check if the new passwords match
    if (password_1 !== password_2) {
        return res.status(400).json({ response: "New passwords do not match" });
    }

    // Password validation
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password_1)) {
        return res.status(400).send({ 'message': 'Password does not meet the required criteria.' });
    }

    const result = await resetUserPassword(token, password_1)

    res.json({ response: result });
});

app.post('/upload_profile_pic', authenticateJWT, async (req, res) => {
    const { base64String } = req.body;
    if (!base64String) {
        return res.status(400).send('No file data provided.');
    }

    const { data, error } = await uploadProfilePic(base64String, req.userId);
    if (error) {
        return res.status(500).send(error);
    }

    res.json({ response: true, data });
});

app.get('/get_profile_pic', authenticateJWT, async (req, res) => {
    const { data, error } = await downloadProfilePic(req.userId);

    if (error) {
        console.error(error);
        return res.status(500).json({ error: 'Failed to download profile pic' });
    }

    if (!data) {
        return res.status(404).json({ error: 'Profile pic not found' });
    }

    // Convert Blob to Buffer
    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Set the correct headers and send the buffer directly
    res.setHeader('Content-Type', data.type);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
});

/********************* Subscriptions ***********/
app.post('/create_subscription', authenticateJWT, onlyOwner, async (req, res) => {
    const { name, description, level, price_id, price, credits, type } = req.body;

    if (!name || !description || !level || !price_id || !price || !credits || !type) {
        return res.status(400).json({ response: 'Params missing.' });
    }

    const { data, error } = await subscriptions.createSubscription(name, description, level, price_id, price, credits, type)
    return res.status(200).json({ response: data });
});

app.post('/update_subscription', authenticateJWT, onlyOwner, async (req, res) => {
    const { subscription_id, name, description, level, price_id, price, credits, type } = req.body;

    if (!subscription_id || !name || !description || !level || !price_id || !price || !credits || !type) {
        return res.status(400).json({ response: 'Params missing.' });
    }

    const { data, error } = await subscriptions.updateSubscription(subscription_id, name, description, level, price_id, price, credits, type)
    return res.status(200).json({ response: data });
});

app.post('/delete_subscription', authenticateJWT, onlyOwner, async (req, res) => {
    const { subscription_id } = req.body;

    if (!subscription_id) {
        return res.status(400).json({ response: 'Params missing.' });
    }

    const { data, error } = await subscriptions.deleteSubscription(subscription_id)
    return res.status(200).json({ response: data });
});

app.get('/get_subscriptions', async (req, res) => {
    const { data, error } = await subscriptions.getSubscriptions()
    return res.status(200).json({ response: data });
});

app.get('/get_subscription', authenticateJWT, async (req, res) => {
    const { data, error } = await user_subscriptions.getSubscription(req.userId)
    return res.status(200).json({ response: data });
});

app.post('/stripe/webhook', async (req, res) => {
    let data = req.body.data;
    let eventType = req.body.type;

    console.log("eventType", eventType)

    const subscription_id = data.object.subscription
    const customer_id = data.object.customer
    const customer_email = data.object.customer_email
    const price_id = data.object.lines ? data.object.lines.data[0].price.id : ""

    console.log("price_id", price_id)
    console.log("subscription_id", subscription_id)
    console.log("customer_id", customer_id)
    console.log("customer_email", customer_email)

    const { data: user, error: user_error } = await getUserByEmail(customer_email)
    const { data: current_subscription, error: current_subscription_error } = await subscriptions.getSubscriptionByPriceId(price_id)
    switch (eventType) {
        case 'invoice.paid':
            // Continue to provision the subscription as payments continue to be made.
            // Store the status in your database and check when a user accesses your service.
            // This approach helps you avoid hitting rate limits.
            console.log("Subscription paid")
            const { data: current_user_subscription, error: current_user_subscription_error } = await user_subscriptions.getSubscription(user.id)
            if (current_user_subscription) {
                const new_credits = current_user_subscription.credits + current_subscription.credits
                await user_subscriptions.updateSubscription(user.id, customer_id, true, new_credits)
                console.log("customer_id", customer_id)
                console.log("current_user_subscription", current_user_subscription)

            } else {
                const { data: subscription_result, error: subscription_error } = await user_subscriptions.createSubscription(subscription_id, customer_id, user.id, true, current_subscription.credits)
            }


            break;
        case 'invoice.payment_failed':
            // The payment failed or the customer does not have a valid payment method.
            // The subscription becomes past_due. Notify your customer and send them to the
            // customer portal to update their payment information.
            console.log("Subscription not paid")
            //await user_subscriptions.updateSubscription(user.id, customer_id, false, null)

            break;
        case 'customer.subscription.deleted':
            console.log("Subscription canceled")
            await user_subscriptions.updateSubscription(user.id, customer_id, false)
            break;
        default:
    }

    res.sendStatus(200);
});

app.post('/start_subscription', authenticateJWT, async (req, res) => {
    const { price_id } = req.body

    const { data: user, error: user_error } = await getUserById(req.userId)
    if (!user) {
        return res.status(404).json({ error: 'User not found' })
    }

    const { data: assign_result, error: assign_error } = await subscriptions.assignSubscription(req.userId, price_id)
    if (!assign_result) {
        return res.status(500).json({ error: 'Error assigning subscription' })
    }

    const url = await stripe_subscriptions.createSession(user.email, price_id)
    res.json({ response: url })
})

app.get('/get_stripe_portal', authenticateJWT, async (req, res) => {
    const { data: subscription, error: subscription_error } = await user_subscriptions.getSubscription(req.userId)
    const url = await stripe_subscriptions.createPortal(subscription.customer_id)

    res.json({ response: url })
})

/********************* Agents ***********/
app.post('/create_agent', authenticateJWT, onlyOwner, async (req, res) => {
    const { name, temperature, type, level, prompt } = req.body;

    console.log(req.body)
    if (!name || !type || !level || !prompt) {
        return res.status(400).json({ response: 'Params missing.' });
    }

    const { data, error } = await createAgent(name, temperature, type, level, prompt)
    return res.status(200).json({ response: data });
});

app.post('/update_agent', authenticateJWT, onlyOwner, async (req, res) => {
    const { agent_id, name, temperature, type, level, prompt } = req.body;

    if (!agent_id || !name || !type || !level || !prompt) {
        return res.status(400).json({ response: 'Params missing.' });
    }

    const { data, error } = await updateAgent(agent_id, name, temperature, type, level, prompt)
    return res.status(200).json({ response: data });
});

app.post('/get_agent', authenticateJWT, async (req, res) => {
    const { agent_id } = req.body;

    if (!agent_id) {
        return res.status(400).json({ response: 'Params missing.' });
    }

    const { data, error } = await getAgentById(agent_id)
    return res.status(200).json({ response: data });
})

app.get('/get_agents_per_level', authenticateJWT, async (req, res) => {
    const { data: user, error: user_error } = await getUserById(req.userId)

    const level = user.role == 'owner' ? 3 : user.subscription_level
    const { data, error } = await getAgentsPerLevel(level)
    return res.status(200).json({ response: data });
})

app.get('/get_all_agents', async (req, res) => {
    const { data, error } = await getAllAgents()
    return res.status(200).json({ response: data });
})

app.post('/delete_agent', authenticateJWT, onlyOwner, async (req, res) => {
    const { agent_id } = req.body;

    if (!agent_id) {
        return res.status(400).json({ response: 'Params missing.' });
    }

    const { data, error } = await deleteAgent(agent_id)
    return res.status(200).json({ response: data });
})

/********************* Conversations ***********/
app.get('/create_conversation', authenticateJWT, async (req, res) => {
    // Set a new unique message ID
    ongoingMessageIds.set(req.userId, `msg-${Date.now()}`);

    const context = [
        { role: 'system', content: starting_prompt },
    ]

    const { data, error } = await createConversation('Default', context, req.userId)
    return res.status(200).json({ response: data });
})

app.get('/get_conversations', authenticateJWT, async (req, res) => {
    const { data, error } = await getConversationsByUserId(req.userId)
    return res.status(200).json({ response: data });
})

app.get('/get_conversation', authenticateJWT, async (req, res) => {
    const { conversation_id } = req.query;

    if (!conversation_id) {
        return res.status(400).json({ response: 'Params missing.' });
    }

    const { data, error } = await getConversation(conversation_id)
    return res.status(200).json({ response: data });
})

app.post('/delete_conversation', authenticateJWT, async (req, res) => {
    const { conversation_id } = req.body;

    if (!conversation_id) {
        return res.status(400).json({ response: 'Params missing.' });
    }

    const { data, error } = await deleteConversation(conversation_id)
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

// Only owner can perform this actions
async function onlyOwner(req, res, next) {
    const userId = req.userId;
    console.log("userId", userId)
    const { data: user, user_error } = await getUserById(userId)
    console.log(user)
    if (user.role != 'owner') {
        return res.status(401).json({ error: 'Unauthorized access' })
    }

    next()
}

// Only users with active subscriptions
async function onlyActiveSubscription(req, res, next) {
    const { data: user, user_error } = await getUserById(req.userId)
    const { data: subscription, error: subscription_error } = await user_subscriptions.getSubscription(user.id)
    if (!subscription || !subscription.is_active) {
        return res.status(401).json({ error: 'Unauthorized access' })
    }

    next()
}