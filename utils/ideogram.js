const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const sharp = require('sharp');
const BASE_URL = 'https://api.ideogram.ai/';

// Helper function to download image from URL
async function downloadImage(imageUrl, filePath) {
    const writer = fs.createWriteStream(filePath);
    const response = await axios({
        url: imageUrl,
        method: 'GET',
        responseType: 'stream',
    });

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

async function generateIdeogramImage(prompt, prompt_commands) {
    let aspect_ratio = "ASPECT_10_16";
    let style_type = "GENERAL";
    let negative_prompt = "";

    if (prompt_commands.length > 0) {
        prompt_commands.forEach(command => {
            switch (command.command) {
                case 'aspectRatio':
                    aspect_ratio = command.value;
                    break;
                case 'styleType':
                    style_type = command.value;
                    break;
                case 'negativePrompt':
                    negative_prompt = command.value;
                    break;
                default:
                    console.warn(`Unknown command: ${command.command}`);
            }
        });
    }

    const payload = {
        image_request: {
            prompt: prompt,
            aspect_ratio: aspect_ratio,
            model: "V_2",
            magic_prompt_option: "AUTO",
            style_type: style_type,
            negative_prompt: negative_prompt
        }
    };

    try {
        const response = await axios.post(BASE_URL + "generate", payload, {
            headers: {
                'Api-Key': process.env.IDEOGRAM_API_KEY,
                'Content-Type': 'application/json'
            }
        });
        console.log(response.data);
        return response.data.data[0].url;
    } catch (error) {
        console.error(error);
    }
}

async function remixIdeogramImage(prompt, prompt_commands, image_url) {
    let aspect_ratio = "ASPECT_10_16";
    let style_type = "GENERAL";
    let negative_prompt = "";

    // Parse commands
    if (prompt_commands.length > 0) {
        prompt_commands.forEach(command => {
            switch (command.command) {
                case 'aspectRatio':
                    aspect_ratio = command.value;
                    break;
                case 'styleType':
                    style_type = command.value;
                    break;
                case 'negativePrompt':
                    negative_prompt = command.value;
                    break;
                default:
                    console.warn(`Unknown command: ${command.command}`);
            }
        });
    }

    // Download the image to a temporary location
    const tempFilePath = path.join(__dirname, `${uuidv4()}.jpg`);
    await downloadImage(image_url, tempFilePath);

    // Create form data
    const form = new FormData();
    form.append('image_request', JSON.stringify({
        prompt: prompt,
        aspect_ratio: aspect_ratio,
        model: "V_2",
        magic_prompt_option: "AUTO",
        style_type: style_type,
        negative_prompt: negative_prompt,
        image_weight: 50
    }));
    form.append('image_file', fs.createReadStream(tempFilePath));

    // Post to the API
    try {
        const response = await axios.post(BASE_URL + "remix", form, {
            headers: {
                ...form.getHeaders(), // Important to set the correct form data headers
                'Api-Key': process.env.IDEOGRAM_API_KEY,
            }
        });
        console.log(response.data);
        return response.data.data[0].url;
    } catch (error) {
        console.error(error);
    } finally {
        // Clean up by removing the temporary file
        fs.unlinkSync(tempFilePath);
    }
}

async function upscaleIdeogramImage(image_url) {
    // Download the image to a temporary location
    const tempFilePath = path.join(__dirname, `${uuidv4()}.jpg`);
    const resizedFilePath = path.join(__dirname, `${uuidv4()}-resized.jpg`);

    await downloadImage(image_url, tempFilePath);

    // Resize the image to ensure it is less than or equal to 1024x1024 pixels
    await sharp(tempFilePath)
        .resize({
            width: 1024,
            height: 1024,
            fit: 'inside', // Ensure that the image fits within the 1024x1024 bounds without cropping
            withoutEnlargement: true // Don't enlarge images that are smaller than 1024x1024
        })
        .toFile(resizedFilePath);

    // Create form data with the resized image
    const form = new FormData();
    form.append('image_request', '{}'); // Empty JSON object as specified
    form.append('image_file', fs.createReadStream(resizedFilePath));

    // Post to the API
    try {
        const response = await axios.post(BASE_URL + "upscale", form, {
            headers: {
                ...form.getHeaders(), // Ensure correct form data headers
                'Api-Key': process.env.IDEOGRAM_API_KEY,
            }
        });
        console.log(response.data);
        return response.data.data[0].url;
    } catch (error) {
        console.error(error);
    } finally {
        // Clean up by removing both the original and resized temporary files
        fs.unlinkSync(tempFilePath);
        fs.unlinkSync(resizedFilePath);
    }
}

async function describeIdeogramImage(image_url) {
    // Download the image to a temporary location
    const tempFilePath = path.join(__dirname, `${uuidv4()}.jpg`);
    await downloadImage(image_url, tempFilePath);

    // Create form data with the downloaded image
    const form = new FormData();
    form.append('image_file', fs.createReadStream(tempFilePath));

    // Post to the API
    try {
        const response = await axios.post(BASE_URL + "describe", form, {
            headers: {
                ...form.getHeaders(), // Ensure correct form data headers
                'Api-Key': process.env.IDEOGRAM_API_KEY,
            }
        });
        console.log(response.data);
        return response.data; // Return the description data
    } catch (error) {
        console.error("Error while describing image: ", error);
    } finally {
        // Clean up by removing the temporary file
        fs.unlinkSync(tempFilePath);
    }
}

module.exports = { generateIdeogramImage, remixIdeogramImage, upscaleIdeogramImage, describeIdeogramImage };
