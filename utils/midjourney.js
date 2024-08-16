const axios = require("axios")

async function generateImage(prompt) {
    const config = {
        method: "post",
        url: "https://api.imaginepro.ai/api/v1/midjourney/imagine",
        headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + process.env.MIDJOURNEY_TOKEN,
        },
        data: {
            prompt: prompt + " —v 6.0",
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

async function checkImageStatus(imageId) {
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
}

async function pressButton(messageId, button) {
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
}

module.exports = {
    generateImage,
    checkImageStatus,
    pressButton
};