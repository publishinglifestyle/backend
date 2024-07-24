const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_API_KEY);
const { decode } = require('base64-arraybuffer')
const axios = require('axios');
const uuid = require('uuid');

async function upload(bucket, file_buffer, name) {
    // Check if the logo already exists
    const { data: existingData, error: existingError } = await supabase
        .storage
        .from(bucket)
        .list('', {
            search: name + '.png'
        });

    if (existingError) {
        return { data: null, error: existingError };
    }

    // If the logo exists, remove it
    if (existingData.length > 0) {
        const { error: removeError } = await supabase
            .storage
            .from(bucket)
            .remove([name + '.png']);

        if (removeError) {
            return { data: null, error: removeError };
        }
    }

    // Upload the new logo
    const { data, error } = await supabase
        .storage
        .from(bucket)
        .upload(name + '.png', decode(file_buffer), {
            contentType: 'image/png'
        });

    return { data, error };
}

async function download(bucket, name) {
    const { data, error } = await supabase
        .storage
        .from(bucket)
        .download(name + '.png')

    return { data, error };
}

async function downloadAndConvert(imageUrl) {
    const imageResponse = await axios({
        url: imageUrl,
        responseType: 'arraybuffer'
    });

    const imageBuffer = Buffer.from(imageResponse.data, 'binary');
    const base64String = imageBuffer.toString('base64');

    // Upload the image
    const randomId = uuid.v4().substring(0, 8);
    const { data, error } = await upload('images', base64String, randomId);

    // Update context with the image URL
    imageUrl = "https://urrfcikwbcocmanctoca.supabase.co/storage/v1/object/public/" + data.fullPath
    return imageUrl;
}

module.exports = {
    upload,
    download,
    downloadAndConvert
};