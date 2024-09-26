const axios = require("axios")

/*async function generateImage(prompt, prompt_commands) {
    let prompt_commands_string = ""
    for (let i = 0; i < prompt_commands.length; i++) {
        prompt_commands_string += " " + prompt_commands[i].command + " " + prompt_commands[i].value
    }

    if (prompt_commands.length > 0) {
        prompt = prompt + " —v 6.0 " + prompt_commands_string
    } else {
        prompt = prompt + " —v 6.0"
    }

    const config = {
        method: "post",
        url: "https://api.imaginepro.ai/api/v1/midjourney/imagine",
        headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + process.env.MIDJOURNEY_TOKEN,
        },
        data: {
            prompt: prompt
        },
    }

    console.log(config)

    try {
        const response = await axios(config)
        return response.data;
    } catch (error) {
        console.error(error)
        return null;
    }
}*/

async function generateImage(api_key, prompt, prompt_commands, socket_id, conversation_id) {
    console.log("Generating image with prompt: " + prompt)
    let prompt_commands_string = ""
    for (let i = 0; i < prompt_commands.length; i++) {
        prompt_commands_string += " " + prompt_commands[i].command + " " + prompt_commands[i].value
    }

    if (prompt_commands.length > 0) {
        prompt = prompt + prompt_commands_string
    }

    const config = {
        method: "post",
        url: process.env.MY_MIDJOURNEY_URL + "/api/v1/imagine",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": api_key,
        },
        data: {
            prompt,
            webhookUrl: process.env.BASE_URL + "/midjourney_callback",
            webhookData: { socket_id, conversation_id }
        },
    }

    try {
        const response = await axios(config)
        return response.data;
    } catch (error) {
        console.error(error)
        return null;
    }
}

/*async function checkImageStatus(imageId) {
    const config = {
        method: "get",
        url: "https://api.imaginepro.ai/api/v1/midjourney/message/" + imageId,
        headers: {
            Authorization: "Bearer " + process.env.MIDJOURNEY_TOKEN,
        },
    }

    try {
        const response = await axios(config)
        return response.data;
    } catch (error) {
        console.error(error)
        return null;
    }
}*/

/*async function pressButton(messageId, button) {
    const config = {
        method: "post",
        url: "https://api.imaginepro.ai/api/v1/midjourney/button",
        headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + process.env.MIDJOURNEY_TOKEN,
        },
        data: {
            messageId, button
        },
    }

    try {
        const response = await axios(config)
        return response.data;
    } catch (error) {
        console.error(error)
        return null;
    }
}*/

async function sendAction(api_key, msgId, customId, prompt, prompt_commands, flags, socket_id, conversation_id) {
    console.log("Sending action with prompt: " + prompt)
    let prompt_commands_string = ""
    for (let i = 0; i < prompt_commands.length; i++) {
        prompt_commands_string += " " + prompt_commands[i].command + " " + prompt_commands[i].value
    }

    if (prompt_commands.length > 0) {
        prompt = prompt + prompt_commands_string
    }

    const config = {
        method: "post",
        url: process.env.MY_MIDJOURNEY_URL + "/api/v1/action",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": api_key,
        },
        data: {
            msgId,
            customId,
            prompt,
            flags,
            webhookUrl: process.env.BASE_URL + "/midjourney_callback",
            webhookData: { socket_id, conversation_id }
        },
    }

    try {
        const response = await axios(config)
        return response.data;
    } catch (error) {
        console.error(error)
        return null;
    }
}

async function signUpMjUser(email) {
    // Generate a random password of 8 characters
    const password = Math.random().toString(36).slice(-8);
    const config = {
        method: "post",
        url: process.env.MY_MIDJOURNEY_URL + "/api/v1/sign_up",
        headers: {
            "Content-Type": "application/json"
        },
        data: {
            email,
            password,
            password_2: password
        },
    }

    try {
        const response = await axios(config)
        return response.data;
    } catch (error) {
        console.error(error)
        return null;
    }
}

module.exports = {
    generateImage,
    //checkImageStatus,
    sendAction,
    signUpMjUser
};